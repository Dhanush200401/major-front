
// src/components/Meeting/index.js
import React, { Component } from "react";
import io from "socket.io-client";
import "./index.css";
import { FaHome, FaVideo } from "react-icons/fa";
import { IoMdMic } from "react-icons/io";
import { FiMessageCircle } from "react-icons/fi";
import { MdDirectionsWalk, MdOutlineKeyboardArrowLeft } from "react-icons/md";
import { IoSearch } from "react-icons/io5";
import map_img from "./assets/tiles/tileset.png";
import avatarSprite from "./assets/avatars/avatars_sprites.png";
import mapData from "./assets/tiles/Communication___room.json";
import { IoAttach, IoSend } from "react-icons/io5";
import { FiRefreshCw, FiEdit, FiX } from "react-icons/fi";



const ICE_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Interactables layer name (match your Tiled layer name)
const INTERACTABLES_LAYER_NAME = "Interactables";

// Data channel chunk size
const FILE_CHUNK_SIZE = 64 * 1024; // 64KB

class Meeting extends Component {
  // Non-state storages for peers and animations
  peerConnections = {}; // peerId -> RTCPeerConnection
  dataChannels = {}; // peerId -> RTCDataChannel (if created/received)
  incomingFiles = {}; // fileId -> { meta, receivedSize, chunks: [] }
  animationFrame = null;
  keysPressed = {};

  // Preloaded images
  mapImg = new Image();
  spriteImg = new Image();

  // FLAG to avoid duplicate listener attachment
  _fileSharedListenerAttached = false;

  // Component state
  state = {
    onlineUsers: [],
    offlineUsers: [],
    userData: null,
    localStream: null,
    myAvatar: {
      _id: null,
      name: "Me",
      x: 100,
      y: 200,
      width: 50,
      height: 50,
      frame: 0,
      dir: 0,
    },
    isAudioOn: false,
    isVideoOn: false,
    peers: {}, // map peerId -> { pc, stream, name, isVideoOn }
    connectedPeers: [], // list of peerIds with active RTCPeerConnection objects
    showChatPanel: false,
    chatMessages: [], // { fromId, fromName, text?, isFile?, fileName?, fileUrl? }
    showProximityUI: false, // controls right-side panel visibility
    activeOverlayPeers: [], // list of nearby peer ids
    // UI defaults
    showSidebar: false,
    activeTab: "users",
    isSidebarCollapsed: false,
    showVideo: false,
  };

  allUsers = [];
  roomId = "global";

  constructor(props) {
    super(props);
    this.prevActiveStreamsCount = 0;
    this._isMounted = false;
  }

  // ---------- NEW helper: centralized file-shared handler ----------
  // Keeps behavior consistent across all places we attach the socket listener.
  handleFileShared = (payload) => {
    try {
      if (!payload) return;
      // Normalize: server may send fileUrl OR only fileId
      const myId = this.state.userData?._id;
      // If I'm the uploader, ignore because we already replace pending entry locally
      if (payload.fromId && myId && payload.fromId === myId) return;

      const host = window.location.origin || "http://localhost:3000";
      const fileUrl = payload.fileUrl
        ? payload.fileUrl.startsWith("http")
          ? payload.fileUrl
          : `${window.location.origin.replace(/:3000$/, ":5000")}${
              payload.fileUrl
            }`
        : `${window.location.origin.replace(/:3000$/, ":5000")}/api/files/${
            payload.fileId
          }`;

      const fromName = payload.fromName || payload.fromId || "User";

      this.setState((prev) => ({
        chatMessages: [
          ...prev.chatMessages,
          {
            fromId: payload.fromId,
            fromName,
            isFile: true,
            fileName: payload.fileName,
            fileUrl,
            fileId: payload.fileId,
            ts: Date.now(),
          },
        ],
      }));
    } catch (err) {
      console.warn("handleFileShared error:", err);
    }
  };
  // ----------------------------------------------------------------

  // returns the zone name (string) for the provided position (x,y) or null if none
  getZoneForPosition = (x, y) => {
    const zones =
      this.interactiveZones ||
      mapData.layers?.find((l) => l.name === INTERACTABLES_LAYER_NAME)
        ?.objects ||
      [];
    if (!zones || !zones.length) return null;

    for (const zone of zones) {
      const zx = zone.x || 0;
      const zy = zone.y || 0;
      const zw = zone.width || 0;
      const zh = zone.height || 0;
      // check using top-left coordinates exported by Tiled
      if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) {
        // try to read a friendly name from properties (Tiled often stores it there)
        let zoneName = null;
        if (Array.isArray(zone.properties)) {
          const p = zone.properties.find(
            (pr) =>
              pr.name === "name" ||
              pr.name === "zoneName" ||
              pr.name === "label"
          );
          if (p) zoneName = p.value;
        }
        // fallback to object.name (Tiled object name) or id-based name
        return zoneName || zone.name || `zone-${zone.id}`;
      }
    }
    return null;
  };

  // --------------------
  // Helper: normalize/dedupe incoming user lists
  // --------------------
  normalizeUsersList = (raw) => {
    let arr = [];
    if (Array.isArray(raw)) {
      arr = raw.map((u) => ({
        _id: u.userId || u._id || u.id,
        x: typeof u.x === "number" ? u.x : 100,
        y: typeof u.y === "number" ? u.y : 100,
        width: u.width || this.state.myAvatar.width,
        height: u.height || this.state.myAvatar.height,
        name: u.username || u.name || "User",
        avatar: u.avatar || null,
      }));
    } else if (raw && typeof raw === "object") {
      arr = Object.entries(raw).map(([uid, u]) => ({
        _id: uid,
        x: typeof u.x === "number" ? u.x : 100,
        y: typeof u.y === "number" ? u.y : 100,
        width: u.width || this.state.myAvatar.width,
        height: u.height || this.state.myAvatar.height,
        name: u.username || u.name || "User",
        avatar: u.avatar || null,
      }));
    }

    // Deduplicate by _id and filter out local user
    const map = new Map();
    const localId = this.state?.userData?._id;
    arr.forEach((u) => {
      if (!u || !u._id) return;
      if (u._id === localId) return;
      if (!map.has(u._id)) map.set(u._id, u);
      else {
        const existing = map.get(u._id);
        map.set(u._id, { ...existing, ...u });
      }
    });
    return Array.from(map.values());
  };

  componentDidMount = async () => {
    this._isMounted = true;
    try {
      const params = new URLSearchParams(window.location.search);
      this.roomId = params.get("roomId") || "global";
    } catch (err) {
      console.warn("Error parsing roomId:", err);
    }

    await this.preloadImages([map_img, avatarSprite]);
    this.mapImg.src = map_img;
    this.spriteImg.src = avatarSprite;
    // cache Interactables zones for fast lookups
    this.interactiveZones =
      mapData.layers?.find((l) => l.name === INTERACTABLES_LAYER_NAME)
        ?.objects || [];
    console.log(
      "[Map] Interactables zones loaded:",
      this.interactiveZones.length
    );

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    await this.initUserAndSocket();
    if (!this.socket) return;

    const currentUser = this.state.userData;
    if (currentUser && currentUser._id) {
      this.setState((prev) => ({
        myAvatar: {
          ...prev.myAvatar,
          _id: currentUser._id,
          name: currentUser.name,
          width: prev.myAvatar.width || 50,
          height: prev.myAvatar.height || 50,
          avatar: currentUser.avatar || null,
        },
      }));
    }

    this.startAnimationLoop();

    // NOTE:
    // I moved file-shared handling into a centralized function `handleFileShared`.
    // Here we attach it (this ensures the listener is attached even if initUserAndSocket
    // didn't attach early enough). We mark the flag so initUserAndSocket will not re-attach.
    if (!this._fileSharedListenerAttached) {
      this.socket.on("file-shared", (payload) => {
        this.handleFileShared(payload);
      });
      this._fileSharedListenerAttached = true;
    }

    // Listen for other clients toggling video (update UI)
    this.socket.on("video-toggle", ({ userId, enabled }) => {
      const peer = this.state.peers[userId];
      if (!peer) return;
      this.setState((prev) => ({
        peers: {
          ...prev.peers,
          [userId]: { ...peer, isVideoOn: enabled },
        },
      }));
      const vidEl = document.getElementById(`video-${userId}`);
      if (vidEl) vidEl.srcObject = enabled ? peer.stream : null;
    });

    // Optional: server can send chat messages as { from, message }
    this.socket.on("chat", ({ from, message }) => {
      const fromName =
        this.state.onlineUsers.find((u) => u._id === from)?.name ||
        (from === this.state.userData?._id
          ? this.state.userData?.name
          : "User");
      this.setState((prev) => ({
        chatMessages: [
          ...prev.chatMessages,
          { fromId: from, fromName, text: message, ts: Date.now() },
        ],
      }));
    });

    // Server broadcasted files (fallback) - server should send { fromId, fromName, filename, mime, buffer (binary) }
    this.socket.on(
      "file-broadcast",
      ({ fromId, fromName, filename, mime, buffer }) => {
        try {
          const blob = new Blob([buffer], {
            type: mime || "application/octet-stream",
          });
          const url = URL.createObjectURL(blob);
          this.setState((prev) => ({
            chatMessages: [
              ...prev.chatMessages,
              {
                fromId,
                fromName,
                isFile: true,
                fileName: filename,
                fileUrl: url,
                ts: Date.now(),
              },
            ],
          }));
        } catch (err) {
          console.warn("file-broadcast handle error:", err);
        }
      }
    );
  };

  componentWillUnmount() {
    this._isMounted = false;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (this.state.localStream) {
      this.state.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.warn(err);
        }
      });
    }
    Object.keys(this.peerConnections).forEach((peerId) => {
      try {
        this.peerConnections[peerId].close();
        delete this.peerConnections[peerId];
      } catch (err) {
        console.warn("Error closing peer:", peerId, err);
      }
    });
    // reset state minimally
    this.setState({
      peers: {},
      connectedPeers: [],
      localStream: null,
      isAudioOn: false,
      isVideoOn: false,
      showVideo: false,
      showChatPanel: false,
    });
  }

  // ---------------------
  // Socket and user init
  // ---------------------
  initUserAndSocket = async () => {
    try {
      const profileRes = await fetch("https://major-project-backend-u1ju.onrender.com/api/auth/me", {
        credentials: "include",
      });
      if (!profileRes.ok) throw new Error("Not logged in");
      const userData = await profileRes.json();
      if (!this._isMounted) return;

      this.setState((prev) => ({
        userData,
        myAvatar: {
          ...prev.myAvatar,
          _id: userData._id,
          name: userData.name,
          width: prev.myAvatar.width,
          height: prev.myAvatar.height,
          avatar: userData.avatar || null,
        },
      }));

      const usersRes = await fetch("https://major-project-backend-u1ju.onrender.com/api/users", {
        credentials: "include",
      });
      const allUsers = (await usersRes.json()) || [];
      this.allUsers = allUsers;
      const offlineUsers = allUsers.filter((u) => u._id !== userData._id);
      if (this._isMounted) this.setState({ offlineUsers });

      // create socket
      this.socket = io("https://major-project-backend-u1ju.onrender.com", {
        withCredentials: true,
        transports: ["websocket"],
        auth: {
    token: Cookies.get("jwt_token")
  }
      });

      // Attach file-shared listener early here too (only if not already attached)
      if (this.socket && !this._fileSharedListenerAttached) {
        this.socket.on("file-shared", (payload) => {
          this.handleFileShared(payload);
        });
        this._fileSharedListenerAttached = true;
      }

      this.socket.on("connect", () => {
        this.socket.emit("joinRoom", {
          roomId: this.roomId,
          avatar: this.state.myAvatar,
        });
        console.log("[Socket] Connected and joined room:", this.roomId);
      });

      this.socket.on("currentPositions", (usersObj) => {
        let normalized = this.normalizeUsersList(usersObj || {});
        // merge current user (me) into the list so onlineUsers contains me
        const me = this.makeMeEntry();
        if (me) {
          normalized = Array.from(
            new Map([
              [me._id, me],
              ...normalized.map((u) => [u._id, u]),
            ]).values()
          );
        }
        if (this._isMounted) {
          this.setState({ onlineUsers: normalized }, () => {
            this.updateOfflineUsers(normalized);
            this.checkProximityAndManagePeers();
            console.log(
              "[Socket] currentPositions -> onlineUsers set:",
              normalized
            );
          });
        }
      });

      this.socket.on("onlineUsers", (usersArr) => {
        let normalized = this.normalizeUsersList(usersArr || []);
        const me = this.makeMeEntry();
        if (me) {
          normalized = Array.from(
            new Map([
              [me._id, me],
              ...normalized.map((u) => [u._id, u]),
            ]).values()
          );
        }
        if (this._isMounted) {
          this.setState({ onlineUsers: normalized }, () => {
            this.updateOfflineUsers(normalized);
            this.checkProximityAndManagePeers();
            console.log("[Socket] onlineUsers -> onlineUsers set:", normalized);
          });
        }
      });

      this.socket.on("userJoined", (user) => {
        const uid = user._id || user.id || user.userId;
        if (!uid || uid === this.state.userData?._id) return;
        const newUser = {
          _id: uid,
          x: typeof user.x === "number" ? user.x : 100,
          y: typeof user.y === "number" ? user.y : 100,
          width: user.width || this.state.myAvatar.width,
          height: user.height || this.state.myAvatar.height,
          name: user.username || user.name || "User",
          avatar: user.avatar || null,
          stream: null,
        };
        this.setState(
          (prev) => {
            if (prev.onlineUsers.find((u) => u._id === uid)) return prev;
            return { onlineUsers: [...prev.onlineUsers, newUser] };
          },
          () => {
            this.updateOfflineUsers(this.state.onlineUsers);
            this.checkProximityAndManagePeers();
          }
        );
        console.log("[Socket] User joined:", uid);
      });

      this.socket.on("userMoved", (payload) => {
        const id = payload.userId || payload._id || payload.id;
        const x = payload.x;
        const y = payload.y;
        if (!id) return;
        this.setState(
          (prev) => ({
            onlineUsers: prev.onlineUsers.map((u) =>
              u._id === id ? { ...u, x, y } : u
            ),
          }),
          () => {
            this.checkProximityAndManagePeers();
          }
        );
      });

      this.socket.on("userLeft", (payload) => {
        const id = payload.id || payload.userId || payload._id;
        if (!id) return;
        this.setState(
          (prev) => ({
            onlineUsers: prev.onlineUsers.filter((u) => u._id !== id),
            peers: Object.fromEntries(
              Object.entries(prev.peers).filter(([pid]) => pid !== id)
            ),
          }),
          () => {
            this.checkProximityAndManagePeers();
          }
        );
        if (this.peerConnections[id]) {
          try {
            this.peerConnections[id].close();
          } catch (e) {
            console.warn(e);
          }
          delete this.peerConnections[id];
        }
        // remove data channel if present
        if (this.dataChannels[id]) {
          try {
            this.dataChannels[id].close?.();
          } catch (e) {}
          delete this.dataChannels[id];
        }
        console.log("[Socket] User left:", id);
      });

      // unified signaling
      this.socket.on("signal", async (msg) => {
        console.log("[Signal] received", msg);
        const from = msg.from || msg.userId || msg.id;
        const type = msg.type || msg.signalType;
        const data = msg.data;
        if (!from || !type) return;
        if (type === "offer") await this.handleOffer(from, data);
        else if (type === "answer") await this.handleAnswer(from, data);
        else if (type === "candidate" || type === "ice-candidate")
          await this.handleCandidate(from, data);
      });

      console.log("[Init] Socket listeners attached.");
    } catch (err) {
      console.error("initUserAndSocket error:", err);
    }
  };

  // add this function somewhere near normalizeUsersList (top helpers)
  makeMeEntry = () => {
    const id = this.state?.userData?._id;
    if (!id) return null;
    const avatar =
      this.state.userData?.avatar || this.state.myAvatar?.avatar || null;
    return {
      _id: id,
      x:
        typeof this.state.myAvatar?.x === "number"
          ? this.state.myAvatar.x
          : this.state.myAvatar?.x || 100,
      y:
        typeof this.state.myAvatar?.y === "number"
          ? this.state.myAvatar.y
          : this.state.myAvatar?.y || 100,
      width: this.state.myAvatar?.width || 50,
      height: this.state.myAvatar?.height || 50,
      name: this.state.userData?.name || this.state.myAvatar?.name || "Me",
      avatar,
    };
  };

  updateOfflineUsers = (currentOnline = []) => {
    if (!this._isMounted) return;
    const onlineIds = currentOnline.map((u) => u._id);
    const updatedOffline = (this.allUsers || []).filter(
      (u) => u._id !== this.state.userData?._id && !onlineIds.includes(u._id)
    );
    this.setState({ offlineUsers: updatedOffline });
  };

  // --------------------------
  // WebRTC: Create PeerConnection
  // --------------------------
  createPeerConnection = (peerId, userInfo = {}) => {
    if (this.peerConnections[peerId]) return this.peerConnections[peerId];
    const pc = new RTCPeerConnection(ICE_CONFIG);

    pc._makingOffer = false;

    // Handle incoming data channels (when remote created one)
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      console.log("[pc.ondatachannel] from", peerId, "label:", dc.label);
      this.setupDataChannel(peerId, dc);
    };

    pc.ontrack = (event) => {
      console.log("[pc.ontrack] from", peerId, "streams:", event.streams);
      const remoteStream = event.streams[0];
      this.setState(
        (prev) => ({
          peers: {
            ...prev.peers,
            [peerId]: {
              ...(prev.peers[peerId] || {}),
              pc,
              stream: remoteStream,
              name: userInfo.username || prev.peers[peerId]?.name || "Unknown",
            },
          },
        }),
        () => {
          const videoEl = document.getElementById(`video-${peerId}`);
          if (videoEl) {
            if (videoEl.srcObject !== remoteStream) {
              videoEl.srcObject = remoteStream;
            }
            videoEl.muted = false;
            videoEl
              .play()
              .catch((err) => console.warn("videoEl.play() blocked:", err));
          } else {
            let audioEl = document.getElementById(`audio-${peerId}`);
            if (!audioEl) {
              audioEl = document.createElement("audio");
              audioEl.id = `audio-${peerId}`;
              audioEl.autoplay = true;
              audioEl.playsInline = true;
              audioEl.style.display = "none";
              document.body.appendChild(audioEl);
            }
            if (audioEl.srcObject !== remoteStream)
              audioEl.srcObject = remoteStream;
            audioEl.muted = false;
            audioEl
              .play()
              .catch((err) => console.warn("audioEl.play() blocked:", err));
          }
        }
      );
    };

    pc.onicecandidate = (event) => {
      console.log("[pc.onicecandidate]", peerId, event.candidate);
      if (event.candidate) {
        try {
          this.socket.emit("signal", {
            from: this.state.myAvatar._id,
            to: peerId,
            type: "candidate",
            data: event.candidate,
          });
        } catch (e) {
          console.warn("socket missing when sending candidate", e);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (
        state === "disconnected" ||
        state === "failed" ||
        state === "closed"
      ) {
        // cleanup peer if disconnected
        if (this.peerConnections[peerId]) {
          try {
            this.peerConnections[peerId].close();
          } catch (e) {}
          delete this.peerConnections[peerId];
        }
        if (this.dataChannels[peerId]) {
          try {
            this.dataChannels[peerId].close?.();
          } catch (e) {}
          delete this.dataChannels[peerId];
        }
        this.setState((prev) => {
          const newPeers = { ...prev.peers };
          delete newPeers[peerId];
          return {
            peers: newPeers,
            connectedPeers: Object.keys(this.peerConnections),
          };
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        "[pc.oniceconnectionstatechange]",
        peerId,
        pc.iceConnectionState
      );
    };

    // renegotiation
    pc.onnegotiationneeded = async () => {
      console.log("[pc.onnegotiationneeded] for", peerId);
      if (pc._makingOffer) return;
      pc._makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket.emit("signal", {
          from: this.state.myAvatar._id,
          to: peerId,
          type: "offer",
          data: offer,
        });
        console.log("[Signal] renegotiation offer sent to", peerId);
      } catch (err) {
        console.warn("onnegotiationneeded error for", peerId, err);
      } finally {
        pc._makingOffer = false;
      }
    };

    this.peerConnections[peerId] = pc;
    // optimistic peers state entry so UI can reference it
    this.setState((prev) => ({
      peers: {
        ...prev.peers,
        [peerId]: {
          ...(prev.peers[peerId] || {}),
          pc,
          stream: prev.peers[peerId]?.stream || null,
          name: userInfo.username || prev.peers[peerId]?.name || "Unknown",
        },
      },
    }));
    return pc;
  };

  // Setup data channel handlers (common for created or received channels)
  setupDataChannel = (peerId, dc) => {
    this.dataChannels[peerId] = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => {
      console.log(`[DataChannel] open for ${peerId}`);
    };
    dc.onclose = () => {
      console.log(`[DataChannel] closed for ${peerId}`);
      delete this.dataChannels[peerId];
    };
    dc.onerror = (e) => console.warn("[DataChannel] error", e);

    dc.onmessage = (ev) => {
      // messages can be strings (JSON meta) or ArrayBuffer (file chunk)
      try {
        if (typeof ev.data === "string") {
          // control JSON messages
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === "file-meta") {
            // init incoming file record
            this.incomingFiles[msg.fileId] = {
              meta: msg,
              receivedSize: 0,
              chunks: [],
            };
            console.log(
              "[DataChannel] file-meta received",
              msg.fileId,
              msg.filename,
              msg.size
            );
          } else {
            console.log("[DataChannel] unknown string msg", msg);
          }
        } else if (ev.data instanceof ArrayBuffer) {
          // binary chunk
          // attempt to assign to latest incoming file if meta exists
          // We expect sender to send meta first with fileId
          // find ongoing file by reading current incomingFiles map first item where not yet complete
          // But better: include fileId in the first few bytes? Instead we rely on ordering: sender sends meta JSON first, then raw chunks only for that fileId.
          // So place chunk in last initiated incoming file (meta present).
          const entries = Object.entries(this.incomingFiles);
          if (entries.length === 0) {
            console.warn(
              "[DataChannel] chunk received but no incomingFiles meta present"
            );
            return;
          }
          // pick the last file that hasn't completed
          let targetFileId = null;
          for (const [fid, rec] of entries) {
            if (rec.receivedSize < rec.meta.size) {
              targetFileId = fid;
              break;
            }
          }
          if (!targetFileId) {
            console.warn(
              "[DataChannel] no matching incoming file to append chunk"
            );
            return;
          }
          const rec = this.incomingFiles[targetFileId];
          rec.chunks.push(ev.data);
          rec.receivedSize += ev.data.byteLength;
          // check completion
          if (rec.receivedSize >= rec.meta.size) {
            // assemble
            const blob = new Blob(rec.chunks, {
              type: rec.meta.mime || "application/octet-stream",
            });
            const url = URL.createObjectURL(blob);
            // add to chat messages
            const fromName =
              this.state.onlineUsers.find((u) => u._id === peerId)?.name ||
              peerId;
            this.setState((prev) => ({
              chatMessages: [
                ...prev.chatMessages,
                {
                  fromId: peerId,
                  fromName,
                  isFile: true,
                  fileName: rec.meta.filename,
                  fileUrl: url,
                  ts: Date.now(),
                },
              ],
            }));
            // cleanup
            delete this.incomingFiles[targetFileId];
            console.log(
              "[DataChannel] file received complete",
              rec.meta.filename
            );
          }
        } else {
          console.log("[DataChannel] unknown data type", typeof ev.data);
        }
      } catch (err) {
        console.error("DataChannel onmessage error:", err);
      }
    };
  };

  // Initiate (create offer) and send via socket
  initiateConnection = async (peerId, userInfo = {}) => {
    const pc = this.createPeerConnection(peerId, userInfo);
    try {
      // Attach local tracks (if we have them) before creating offer
      const localStream = this.state.localStream;
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          if (!pc.getSenders().some((s) => s.track === track)) {
            try {
              pc.addTrack(track, localStream);
            } catch (e) {
              console.warn("addTrack err", e);
            }
          }
        });
      }

      // Create a data channel as initiator (label can be anything)
      try {
        if (!this.dataChannels[peerId]) {
          const dc = pc.createDataChannel("file");
          this.setupDataChannel(peerId, dc);
        }
      } catch (e) {
        console.warn(
          "createDataChannel err (may be fine if remote created one):",
          e
        );
      }

      // Ensure the makingOffer flag exists
      if (typeof pc._makingOffer === "undefined") pc._makingOffer = false;

      // Create and send offer guarded to avoid race with onnegotiationneeded
      if (!pc._makingOffer) {
        pc._makingOffer = true;
        try {
          console.log("[WebRTC] creating offer ->", peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.socket.emit("signal", {
            from: this.state.myAvatar._id,
            to: peerId,
            type: "offer",
            data: offer,
          });
          console.log("[Signal] offer sent to", peerId);
        } finally {
          pc._makingOffer = false;
        }
      } else {
        console.log(
          "[WebRTC] skipping createOffer because _makingOffer flag set for",
          peerId
        );
      }

      // update connectedPeers list
      this.setState({ connectedPeers: Object.keys(this.peerConnections) });
    } catch (err) {
      console.error("[WebRTC] Failed to initiate connection:", err);
      try {
        if (pc) pc._makingOffer = false;
      } catch (e) {
        /*ignore*/
      }
    }
  };

  handleOffer = async (fromId, offer) => {
    console.log("[WebRTC] Offer received from", fromId);
    try {
      const pc = this.createPeerConnection(fromId);
      // If we're in the middle of making an offer, try a rollback (helps glare)
      const isMaking = !!pc._makingOffer;
      const notStable = pc.signalingState !== "stable";
      if (isMaking || notStable) {
        console.log(
          "[WebRTC] Offer collision detected for",
          fromId,
          "makingOffer:",
          isMaking,
          "signalingState:",
          pc.signalingState
        );
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch (rbErr) {
          console.warn("rollback failed (may be OK):", rbErr);
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // If we will send media, add local tracks
      if (this.state.isVideoOn || this.state.isAudioOn) {
        if (!this.state.localStream) await this.ensureLocalStream();
        const localStream = this.state.localStream;
        localStream.getTracks().forEach((track) => {
          if (!pc.getSenders().some((s) => s.track === track))
            pc.addTrack(track, localStream);
        });
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit("signal", {
        from: this.state.myAvatar._id,
        to: fromId,
        type: "answer",
        data: answer,
      });
      console.log("[Signal] answer sent to", fromId);
      this.setState({ connectedPeers: Object.keys(this.peerConnections) });
    } catch (err) {
      console.error(`[WebRTC] Error handling offer from ${fromId}:`, err);
    }
  };

  handleAnswer = async (fromId, answer) => {
    console.log("[WebRTC] handleAnswer from", fromId);
    const pc = this.peerConnections[fromId];
    if (!pc) return console.error(`[WebRTC] No connection found for ${fromId}`);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error(
        "[WebRTC] setRemoteDescription failed for answer from",
        fromId,
        err
      );
    }
  };

  handleCandidate = async (fromId, candidate) => {
    const pc = this.peerConnections[fromId];
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[WebRTC] addIceCandidate failed from", fromId, err);
    }
  };

  // call this when user interacts (click a button / click anywhere)
  enableAudioPlayback = async () => {
    const els = document.querySelectorAll(
      'video[id^="video-"], audio[id^="audio-"]'
    );
    for (const el of els) {
      try {
        const isLocal = el.id === `video-${this.state.userData?._id}`;
        if (!isLocal) el.muted = false;
        await el.play();
      } catch (err) {
        console.warn("enableAudioPlayback: play blocked for", el.id, err);
      }
    }
    try {
      if (
        window.audioContext &&
        typeof window.audioContext.resume === "function"
      ) {
        await window.audioContext.resume();
      }
    } catch (e) {
      /* ignore */
    }
  };

  // Media controls
  ensureLocalStream = async () => {
    if (this.state.localStream) return this.state.localStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (!this._isMounted) {
        stream.getTracks().forEach((t) => t.stop());
        return null;
      }
      this.setState(
        { localStream: stream, isAudioOn: true, isVideoOn: true },
        () => {
          const localVideo = document.getElementById(
            `video-${this.state.userData?._id}`
          );
          if (localVideo) localVideo.srcObject = stream;
        }
      );
      return stream;
    } catch (err) {
      console.warn("Failed to get user media:", err);
      alert("Could not access camera/mic.");
      return null;
    }
  };

  toggleVideo = async () => {
    const currentlyOn = this.state.isVideoOn;
    if (!currentlyOn) {
      const stream = await this.ensureLocalStream();
      if (!stream) return;
      const nearbyIds = this.state.activeOverlayPeers || [];
      for (const pid of nearbyIds) {
        try {
          const pc = this.createPeerConnection(pid, {
            username:
              this.state.onlineUsers.find((u) => u._id === pid)?.name || "User",
          });
          stream.getVideoTracks().forEach((track) => {
            if (!pc.getSenders().some((s) => s.track === track)) {
              try {
                pc.addTrack(track, stream);
              } catch (e) {
                console.warn(e);
              }
            }
          });
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            await this.initiateConnection(pid, {
              username:
                this.state.onlineUsers.find((u) => u._id === pid)?.name ||
                "User",
            });
          }
        } catch (e) {
          console.warn("toggleVideo - error connecting to", pid, e);
        }
      }
      this.setState({ isVideoOn: true, showVideo: true }, () => {
        try {
          this.socket.emit("video-toggle", {
            userId: this.state.myAvatar._id,
            enabled: true,
          });
        } catch (e) {}
      });
    } else {
      if (this.state.localStream)
        this.state.localStream
          .getVideoTracks()
          .forEach((t) => (t.enabled = false));
      this.setState({ isVideoOn: false }, () => {
        try {
          this.socket.emit("video-toggle", {
            userId: this.state.myAvatar._id,
            enabled: false,
          });
        } catch (e) {}
      });
    }
  };

  toggleAudio = async () => {
    const currentlyOn = this.state.isAudioOn;
    if (!currentlyOn) {
      if (!this.state.localStream) await this.ensureLocalStream();
      if (this.state.localStream) {
        this.state.localStream
          .getAudioTracks()
          .forEach((t) => (t.enabled = true));
        const nearbyIds = this.state.activeOverlayPeers || [];
        for (const pid of nearbyIds) {
          try {
            const pc = this.createPeerConnection(pid, {
              username:
                this.state.onlineUsers.find((u) => u._id === pid)?.name ||
                "User",
            });
            this.state.localStream.getAudioTracks().forEach((track) => {
              if (!pc.getSenders().some((s) => s.track === track)) {
                try {
                  pc.addTrack(track, this.state.localStream);
                } catch (e) {
                  console.warn(e);
                }
              }
            });
            if (!pc.remoteDescription || !pc.remoteDescription.type) {
              await this.initiateConnection(pid, {
                username:
                  this.state.onlineUsers.find((u) => u._id === pid)?.name ||
                  "User",
              });
            }
          } catch (e) {
            console.warn("toggleAudio err", e);
          }
        }
      }
      this.setState({ isAudioOn: true });
    } else {
      if (this.state.localStream)
        this.state.localStream
          .getAudioTracks()
          .forEach((t) => (t.enabled = false));
      this.setState({ isAudioOn: false });
    }
  };

  // ---------------------
  // File transfer helpers
  // ---------------------

  // Send a file to server (saved in GridFS) and broadcast to room
  sendFile = async (file) => {
    if (!file) return;
    const fromId = this.state.userData?._id || this.state.myAvatar?._id || "me";
    const fromName =
      this.state.userData?.name || this.state.myAvatar?.name || "Me";

    // create a pending local message so uploader sees immediate preview
    const pendingId = `p-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const localUrl = URL.createObjectURL(file);
    this.setState((prev) => ({
      chatMessages: [
        ...prev.chatMessages,
        {
          _pendingId: pendingId,
          fromId,
          fromName,
          isFile: true,
          fileName: file.name,
          fileUrl: localUrl,
          uploading: true,
          ts: Date.now(),
        },
      ],
    }));

    // Upload to server (server will store in GridFS and broadcast 'file-shared' to others)
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roomId", this.roomId || "");
      // include credentials so server can read jwt cookie
      const res = await fetch("https://major-project-backend-u1ju.onrender.com/api/files/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => null);
        throw new Error(`Upload failed: ${res.status} ${txt || ""}`);
      }
      const data = await res.json();
      // server response includes fileId, fileUrl, fromId, etc
      const fileUrl = data.fileUrl
        ? data.fileUrl.startsWith("http")
          ? data.fileUrl
          : `https://major-project-backend-u1ju.onrender.com${data.fileUrl}`
        : `https://major-project-backend-u1ju.onrender.com/api/files/${data.fileId}`;
      // replace pending message with final server file entry
      this.setState((prev) => ({
        chatMessages: prev.chatMessages.map((m) => {
          if (m._pendingId === pendingId) {
            return {
              fromId,
              fromName,
              isFile: true,
              fileName: data.fileName || file.name,
              fileUrl,
              fileId: data.fileId,
              uploading: false,
              ts: Date.now(),
            };
          }
          return m;
        }),
      }));
      // server will broadcast 'file-shared' -> others will receive it
    } catch (err) {
      console.error("sendFile upload error:", err);
      // mark pending message as failed
      this.setState((prev) => ({
        chatMessages: prev.chatMessages.map((m) => {
          if (m._pendingId === pendingId) {
            return {
              ...m,
              uploading: false,
              uploadError: err.message || "Upload failed",
            };
          }
          return m;
        }),
      }));
    }
  };

  // Send a file to a single peer via data channel (chunked)
  sendFileToPeer = (peerId, file) => {
    return new Promise(async (resolve, reject) => {
      const dc = this.dataChannels[peerId];
      if (!dc) return reject(new Error("No data channel to peer " + peerId));
      // wait for open state
      if (dc.readyState !== "open") {
        // wait for open up to 5s
        const waitOpen = new Promise((res, rej) => {
          const to = setTimeout(
            () => rej(new Error("DataChannel open timeout")),
            5000
          );
          const onopen = () => {
            clearTimeout(to);
            dc.removeEventListener("open", onopen);
            res();
          };
          dc.addEventListener("open", onopen);
        });
        try {
          await waitOpen;
        } catch (err) {
          return reject(err);
        }
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // send meta JSON first
      const meta = {
        type: "file-meta",
        fileId,
        filename: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      };
      try {
        dc.send(JSON.stringify(meta));
      } catch (err) {
        return reject(err);
      }

      // send file in chunks
      try {
        const reader = file.stream ? file.stream().getReader() : null;
        if (reader) {
          // modern streams approach
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              dc.send(value.buffer || value); // value is Uint8Array
            }
          };
          await pump();
          resolve();
        } else {
          // fallback to slicing
          let offset = 0;
          while (offset < file.size) {
            const slice = file.slice(offset, offset + FILE_CHUNK_SIZE);
            const ab = await slice.arrayBuffer();
            dc.send(ab);
            offset += ab.byteLength;
          }
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  // Render
  render() {
    const {
      onlineUsers,
      offlineUsers,
      isSidebarCollapsed,
      showChatPanel,
      chatMessages,
      activeTab,
      peers,
      userData,
      localStream,
      isAudioOn,
      isVideoOn,
    } = this.state;
    return (
      <div className="meeting-container">
        <div className="meeting-header">
          <div className="meeting-icons-container">
            <FaHome className="meeting-icons" />
          </div>
          <div className="meeting-top-controls">
            <button onClick={this.toggleAudio} className="icon-btn">
              <IoMdMic
                style={{ color: this.state.isAudioOn ? "green" : "red" }}
              />
            </button>
            <button onClick={this.toggleVideo} className="icon-btn">
              <FaVideo
                style={{ color: this.state.isVideoOn ? "green" : "red" }}
              />
            </button>
            <button
              onClick={() =>
                this.setState((prev) => ({
                  showChatPanel: !prev.showChatPanel,
                }))
              }
              className="icon-btn"
            >
              <FiMessageCircle />
            </button>
            
          </div>
        </div>

        <div className="meeting-body-container">
          <div
            className={`meeting-sidebar ${
              isSidebarCollapsed ? "collapsed" : ""
            }`}
          >
          

            {!isSidebarCollapsed && (
              <div className="sidebar-tabs">
                <button
                  className={activeTab === "users" ? "active-tab" : ""}
                  onClick={() => this.setState({ activeTab: "users" })}
                >
                  Users
                </button>
                <button
                  className={activeTab === "meeting" ? "active-tab" : ""}
                  onClick={() => this.setState({ activeTab: "meeting" })}
                >
                  Meeting
                </button>
              </div>
            )}

            {!isSidebarCollapsed && (
              <div className="sidebar-tab-content">
                {activeTab === "users" ? (
                  <>
                    <h2 className="meeting-heading">Online</h2>
                    <div className="meeting-online">
                      {onlineUsers.map((u) => (
                        <div className="meeting-user" key={u._id}>
                          <img
                            className="meeting-img"
                            src={u.avatar || avatarSprite}
                            alt="avatar"
                          />
                          <p className="userName">
                            {u._id === userData?._id
                              ? `${u.name} (You)`
                              : u.name}
                          </p>
                          <span className="status-dot green" />
                        </div>
                      ))}
                    </div>
                    <h2 className="meeting-heading">Offline</h2>
                    <div className="meeting-offline">
                      {offlineUsers.map((u) => (
                        <div className="meeting-user" key={u._id}>
                          <img
                            className="meeting-img"
                            src={u.avatar || avatarSprite}
                            alt="avatar"
                          />
                          <p className="userName">{u.name}</p>
                          <span className="status-dot red" />
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="meeting-users-box">
                    {[
                      ...new Map(
                        [...onlineUsers, userData]
                          .filter(Boolean)
                          .map((u) => [u._id, u])
                      ).values(),
                    ].map((u) => {
                      const peer = peers[u._id];
                      const isLocal = u._id === userData?._id;
                      const stream = isLocal ? localStream : peer?.stream;
                      return (
                        <div key={u._id} className="meeting-user-box">
                          {stream ? (
                            <video
                              id={`video-${u._id}`}
                              autoPlay
                              playsInline
                              muted={isLocal}
                              className="meeting-user-video"
                              ref={(el) => {
                                if (el && stream && el.srcObject !== stream) {
                                  el.srcObject = stream;
                                  el.play().catch(() => {});
                                }
                              }}
                            />
                          ) : (
                            <p className="meeting-user-name">{u.name}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className={`meeting-map-column ${
              isSidebarCollapsed ? "expanded" : ""
            }`}
          >
            <div className="meeting-map-container">
              <canvas
                id="mapCanvas"
                width={800}
                height={600}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>

          {/* Right Sidebar Controls - visible only when peers are near */}
          {/* {this.state.showSidebar && (
            
          )} */}

          {showChatPanel && (
            <div className="overlay-chat-panel">
              <div className="chat-header">
  <span className="chat-title">Chat</span>

  <div className="chat-header-icons">
    <FiX className="chat-header-icon" onClick={() => this.setState({ showChatPanel: false })} />
  </div>
</div>

              <div className="overlay-chat-messages">
                {chatMessages.map((m, idx) => {
                  const isSelf = m.fromId === this.state.userData?._id;

                  return (
                    <div
                      key={idx}
                      className={`overlay-chat-message ${
                        isSelf ? "msg-right" : "msg-left"
                      }`}
                    >
                      {/* Avatar */}
                      {/* <img
                        src={m.avatar || avatarSprite}
                        className="chat-avatar"
                        alt="user"
                      /> */}

                      {/* Message Content */}
                      <div className="msg-content">
                        <strong className="msg-name">
                          {m.fromName ||
                            (isSelf ? this.state.userData?.name : "User")}
                        </strong>

                        {m.isFile ? (
                          <a
                            href={m.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                          >
                            {m.fileName}
                          </a>
                        ) : (
                          <span className="msg-name-text">{m.text}</span>
                        )}

                        {m.uploading && (
                          <span
                            style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}
                          >
                            Uploading...
                          </span>
                        )}

                        {m.uploadError && (
                          <span
                            style={{ fontSize: 12, color: "red", marginTop: 4 }}
                          >
                            {m.uploadError}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <ChatInput
                onSend={(msg) => this.sendChatMessage(msg)}
                onSendFile={(file) => this.sendFile(file)}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  handlePeerClose = (peerId) => {
    if (this.peerConnections[peerId]) {
      try {
        this.peerConnections[peerId].close();
      } catch (e) {
        console.warn(e);
      }
      delete this.peerConnections[peerId];
    }
    if (this.dataChannels[peerId]) {
      try {
        this.dataChannels[peerId].close?.();
      } catch (e) {}
      delete this.dataChannels[peerId];
    }
    this.setState((prev) => {
      const newPeers = { ...prev.peers };
      delete newPeers[peerId];
      return {
        peers: newPeers,
        connectedPeers: prev.connectedPeers.filter((id) => id !== peerId),
      };
    });
  };

  preloadImages = async (urls = []) => {
    await Promise.all(
      urls.map(
        (url) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
              console.warn("Failed to load:", url);
              resolve(img);
            };
            img.src = url;
          })
      )
    );
    console.log("Images preloaded");
  };

  handleKeyDown = (e) => {
    if (!e.key) return;
    this.keysPressed[e.key] = true;
  };
  handleKeyUp = (e) => {
    if (!e.key) return;
    delete this.keysPressed[e.key];
  };

  startAnimationLoop = () => {
    const loop = () => {
      if (!this._isMounted) return;
      this.updateAvatarPosition();
      this.drawCanvas();
      this.checkProximityAndManagePeers();
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  };

  updateAvatarPosition = () => {
    const speed = 2;
    let { x, y } = this.state.myAvatar;
    if (this.keysPressed["ArrowUp"]) y -= speed;
    if (this.keysPressed["ArrowDown"]) y += speed;
    if (this.keysPressed["ArrowLeft"]) x -= speed;
    if (this.keysPressed["ArrowRight"]) x += speed;
    const moved = x !== this.state.myAvatar.x || y !== this.state.myAvatar.y;

    if (!this.checkCollision(x, y) && moved) {
      this.setState(
        (prev) => ({ myAvatar: { ...prev.myAvatar, x, y } }),
        () => {
          if (this.socket && this.state.userData)
            this.socket.emit("move", { roomId: this.roomId, x, y });
          // update local onlineUsers entry
          const meId = this.state.userData?._id;
          if (meId) {
            this.setState((prev) => ({
              onlineUsers: prev.onlineUsers.map((u) =>
                u._id === meId ? { ...u, x, y } : u
              ),
            }));
          }
          this.checkProximityAndManagePeers();
        }
      );
    } else {
      this.checkProximityAndManagePeers();
    }

    const hasPeers = Object.keys(this.peerConnections).length > 0;
    if (hasPeers !== this.state.showVideo)
      this.setState({ showVideo: hasPeers });
  };

  checkCollision = (x, y) => {
    const avatar = this.state.myAvatar;
    if (!avatar) return false;
    const avatarW = avatar.width || 32;
    const avatarH = avatar.height || 32;
    const collisionLayer = mapData.layers?.find((l) => l.name === "Collision");
    const collisions = collisionLayer?.objects || [];
    for (const obj of collisions) {
      if (
        x < obj.x + obj.width &&
        x + avatarW > obj.x &&
        y < obj.y + obj.height &&
        y + avatarH > obj.y
      ) {
        return true;
      }
    }
    return false;
  };

  drawCanvas = () => {
    const canvas = document.getElementById("mapCanvas");
    if (!canvas || !this.mapImg || !this.spriteImg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / this.mapImg.width;
    const scaleY = canvas.height / this.mapImg.height;
    ctx.drawImage(this.mapImg, 0, 0, canvas.width, canvas.height);
    const collisions =
      mapData.layers?.find((l) => l.name === "Collision")?.objects || [];
    if (collisions.length) {
      ctx.save();
      ctx.strokeStyle = "red";
      ctx.globalAlpha = 0.3;
      collisions.forEach((obj) =>
        ctx.strokeRect(
          obj.x * scaleX,
          obj.y * scaleY,
          obj.width * scaleX,
          obj.height * scaleY
        )
      );
      ctx.restore();
    }

    // debug draw interactable zones (optional)
    const interactiveZones =
      this.interactiveZones ||
      mapData.layers?.find((l) => l.name === INTERACTABLES_LAYER_NAME)
        ?.objects ||
      [];
    if (interactiveZones.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,128,255,0.6)";
      ctx.lineWidth = 2;
      interactiveZones.forEach((z) => {
        ctx.strokeRect(
          z.x * scaleX,
          z.y * scaleY,
          z.width * scaleX,
          z.height * scaleY
        );
        const label =
          (Array.isArray(z.properties)
            ? z.properties.find((p) => p.name === "name")?.value
            : null) ||
          z.name ||
          `id:${z.id}`;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.font = `${12 * scaleX}px Arial`;
        ctx.fillText(label, z.x * scaleX + 4, z.y * scaleY + 12);
      });
      ctx.restore();
    }

    const drawAvatar = (u) => {
      if (!u) return;
      try {
        const sx = 0,
          sy = 0,
          sw = 128,
          sh = 128;
        const dx = (u.x || 0) * scaleX;
        const dy = (u.y || 0) * scaleY;
        const dw = (u.width || 32) * scaleX;
        const dh = (u.height || 32) * scaleY;
        ctx.drawImage(this.spriteImg, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.fillText(u.name || "User", dx, dy - 6);
      } catch (e) {
        console.warn("Avatar draw error:", e);
      }
    };
    drawAvatar(this.state.myAvatar);
    (this.state.onlineUsers || []).forEach(drawAvatar);
  };

  checkProximityAndManagePeers = () => {
    const me = this.state.myAvatar;
    const online = this.state.onlineUsers || [];

    // Guard
    if (!me || me.x == null || me.y == null) {
      if (this.state.showProximityUI || this.state.showSidebar) {
        this.setState({
          showProximityUI: false,
          showSidebar: false,
          activeOverlayPeers: [],
        });
      }
      return;
    }

    // Determine my id reliably
    const myId = this.state.userData?._id || this.state.myAvatar?._id || null;

    // Use player's center for zone detection (Tiled coords are top-left)
    const myCenterX = me.x + (me.width || 32) / 2;
    const myCenterY = me.y + (me.height || 32) / 2;
    const myZone = this.getZoneForPosition(myCenterX, myCenterY);

    // If I'm not inside any zone — cleanup all peer connections & UI
    if (!myZone) {
      // close all peer connections
      Object.keys(this.peerConnections).forEach((pid) => {
        try {
          this.peerConnections[pid].close();
        } catch (e) {
          console.warn(e);
        }
        delete this.peerConnections[pid];
      });
      Object.keys(this.dataChannels).forEach((pid) => {
        try {
          this.dataChannels[pid].close?.();
        } catch (e) {}
        delete this.dataChannels[pid];
      });
      this.setState({
        peers: {},
        connectedPeers: [],
        showProximityUI: false,
        showSidebar: false,
        activeOverlayPeers: [],
      });
      try {
        if (this.socket) this.socket.emit("leaveZone", { userId: myId });
      } catch (e) {}
      return;
    }

    // find other users in the same zone
    const peersInSameZone = online
      .filter((u) => {
        if (!u || !u._id) return false;
        if (myId && u._id === myId) return false; // skip self
        const ux = (typeof u.x === "number" ? u.x : 0) + (u.width || 32) / 2;
        const uy = (typeof u.y === "number" ? u.y : 0) + (u.height || 32) / 2;
        const zoneForU = this.getZoneForPosition(ux, uy);
        return zoneForU === myZone;
      })
      .map((u) => u._id);

    // Close peer connections for users who left the zone
    const peersInSameZoneSet = new Set(peersInSameZone);
    Object.keys(this.peerConnections).forEach((pid) => {
      if (!peersInSameZoneSet.has(pid)) {
        try {
          this.peerConnections[pid].close();
        } catch (e) {
          console.warn("closing peer err", e);
        }
        delete this.peerConnections[pid];
        // remove UI peer entry
        this.setState((prev) => {
          const newPeers = { ...prev.peers };
          delete newPeers[pid];
          return { peers: newPeers };
        });
      }
    });

    // If the user has audio/video enabled, initiate connections to peers inside the zone
    const wantMedia = this.state.isAudioOn || this.state.isVideoOn;
    if (wantMedia) {
      peersInSameZone.forEach((pid) => {
        if (!this.peerConnections[pid]) {
          this.initiateConnection(pid, {
            username:
              this.state.onlineUsers.find((u) => u._id === pid)?.name || "User",
          }).catch((err) => console.warn("initiateConnection err", err));
        }
      });
    }

    // Update UI state
    const shouldShowUI = peersInSameZone.length > 0;
    this.setState(
      {
        showProximityUI: shouldShowUI,
        showSidebar: shouldShowUI,
        activeOverlayPeers: peersInSameZone,
        connectedPeers: Object.keys(this.peerConnections),
      },
      () => {
        try {
          if (this.socket)
            this.socket.emit("enterZone", { userId: myId, zone: myZone });
        } catch (e) {}
      }
    );
  };

  sendChatMessage = (message) => {
    if (!message.trim() || !this.socket) return;
    const payload = { roomId: this.roomId, message: message.trim() };
    this.socket.emit("chat", payload);
    this.setState((prev) => ({
      chatMessages: [
        ...prev.chatMessages,
        {
          fromId: this.state.userData?._id || "me",
          fromName: this.state.userData?.name || "Me",
          text: message.trim(),
          ts: Date.now(),
        },
      ],
    }));
  };
}

// ChatInput updated with file input
class ChatInput extends Component {
  state = { text: "" };
  fileRef = React.createRef();

  onChange = (e) => this.setState({ text: e.target.value });
  onSend = () => {
    const { text } = this.state;
    if (!text.trim()) return;
    this.props.onSend(text.trim());
    this.setState({ text: "" });
  };
  onKey = (e) => {
    if (e.key === "Enter") this.onSend();
  };

  onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (this.props.onSendFile) this.props.onSendFile(file);
    // reset input
    e.target.value = "";
  };

  render() {
    return (
      <div className="chat-input-bar">
  {/* Attachment */}
  <label className="chat-icon">
    <IoAttach />
    <input
      type="file"
      ref={this.fileRef}
      onChange={this.onFileChange}
      style={{ display: "none" }}
    />
  </label>

  {/* Text Input */}
  <input
    value={this.state.text}
    onChange={this.onChange}
    onKeyDown={this.onKey}
    placeholder="Enter your message"
    className="chat-input"
  />

  {/* Send Button */}
  <div className="chat-icon" onClick={this.onSend}>
    <IoSend />
  </div>
</div>

    );
  }
}

export default Meeting;
