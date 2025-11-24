
// // src/components/Meeting/index.js
// import React, { Component } from "react";
// import io from "socket.io-client";
// import "./index.css";
// import { FaHome, FaVideo } from "react-icons/fa";
// import { IoMdMic } from "react-icons/io";
// import { FiMessageCircle } from "react-icons/fi";
// import { MdDirectionsWalk, MdOutlineKeyboardArrowLeft } from "react-icons/md";
// import { IoSearch, IoAttach, IoSend } from "react-icons/io5";
// import { FiX } from "react-icons/fi";
// import map_img from "./assets/tiles/tileset.png";
// import avatarSprite from "./assets/avatars/avatars_sprites.png";
// import mapData from "./assets/tiles/Communication___room.json";
// import Cookies from "js-cookie";

// const ICE_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
// const INTERACTABLES_LAYER_NAME = "Interactables";
// const FILE_CHUNK_SIZE = 64 * 1024; // 64KB

// class Meeting extends Component {
//   // Non-state storages for peers and animations
//   peerConnections = {}; // peerId -> RTCPeerConnection
//   dataChannels = {}; // peerId -> RTCDataChannel
//   incomingFiles = {}; // fileId -> { meta, receivedSize, chunks: [] }
//   animationFrame = null;
//   keysPressed = {};

//   // Preloaded images
//   mapImg = new Image();
//   spriteImg = new Image();

//   _fileSharedListenerAttached = false;

//   state = {
//     onlineUsers: [],
//     offlineUsers: [],
//     userData: null,
//     localStream: null,
//     myAvatar: { _id: null, name: "Me", x: 100, y: 200, width: 50, height: 50, frame: 0, dir: 0 },
//     isAudioOn: false,
//     isVideoOn: false,
//     peers: {},
//     connectedPeers: [],
//     showChatPanel: false,
//     chatMessages: [],
//     showProximityUI: false,
//     activeOverlayPeers: [],
//     showSidebar: false,
//     activeTab: "users",
//     isSidebarCollapsed: false,
//     showVideo: false
//   };

//   allUsers = [];
//   roomId = "global";
//   currentZone = null; // client-side current zone

//   constructor(props) {
//     super(props);
//     this.prevActiveStreamsCount = 0;
//     this._isMounted = false;
//   }

//   // central file-shared handler
//   handleFileShared = (payload) => {
//     try {
//       if (!payload) return;
//       const myId = this.state.userData?._id;

//       // avoid duplicate self-broadcasts
//       if (payload.fromId && myId && payload.fromId === myId) {
//         console.debug("Ignoring duplicate file-shared broadcast for sender");
//         return;
//       }

//       const fileUrl = payload.fileUrl
//         ? payload.fileUrl.startsWith("http")
//           ? payload.fileUrl
//           : `${window.location.origin.replace(/:3000$/, ":5000")}${payload.fileUrl}`
//         : `${window.location.origin.replace(/:3000$/, ":5000")}/api/files/${payload.fileId}`;

//       const fromName = payload.fromName || payload.fromId || "User";

//       this.setState(prev => ({
//         chatMessages: [...prev.chatMessages, {
//           fromId: payload.fromId,
//           fromName,
//           isFile: true,
//           fileName: payload.fileName,
//           fileUrl,
//           fileId: payload.fileId,
//           ts: Date.now()
//         }]
//       }));
//     } catch (err) {
//       console.warn("handleFileShared error:", err);
//     }
//   }

//   // returns the zone name (string) for the provided position (x,y) or null if none
//   getZoneForPosition = (x, y) => {
//     const zones = this.interactiveZones || (mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || []);
//     if (!zones || !zones.length) return null;

//     for (const zone of zones) {
//       const zx = zone.x || 0;
//       const zy = zone.y || 0;
//       const zw = zone.width || 0;
//       const zh = zone.height || 0;
//       if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) {
//         let zoneName = null;
//         if (Array.isArray(zone.properties)) {
//           const p = zone.properties.find(pr => pr.name === "name" || pr.name === "zoneName" || pr.name === "label");
//           if (p) zoneName = p.value;
//         }
//         return zoneName || zone.name || `zone-${zone.id}`;
//       }
//     }
//     return null;
//   };

//   // compute zone for a user record (by center)
//   computeZoneForUser = (u) => {
//     try {
//       const ux = (typeof u.x === "number" ? u.x : 0) + ((u.width || 32) / 2);
//       const uy = (typeof u.y === "number" ? u.y : 0) + ((u.height || 32) / 2);
//       return this.getZoneForPosition(ux, uy);
//     } catch (e) {
//       return null;
//     }
//   }

//   normalizeUsersList = (raw) => {
//     let arr = [];
//     if (Array.isArray(raw)) {
//       arr = raw.map(u => ({
//         _id: u.userId || u._id || u.id,
//         x: typeof u.x === "number" ? u.x : 100,
//         y: typeof u.y === "number" ? u.y : 100,
//         width: u.width || this.state.myAvatar.width,
//         height: u.height || this.state.myAvatar.height,
//         name: u.username || u.name || "User",
//         avatar: u.avatar || null,
//         zone: null
//       }));
//     } else if (raw && typeof raw === "object") {
//       arr = Object.entries(raw).map(([uid, u]) => ({
//         _id: uid,
//         x: (typeof u.x === "number") ? u.x : 100,
//         y: (typeof u.y === "number") ? u.y : 100,
//         width: u.width || this.state.myAvatar.width,
//         height: u.height || this.state.myAvatar.height,
//         name: u.username || u.name || "User",
//         avatar: u.avatar || null,
//         zone: null
//       }));
//     }

//     // dedupe + exclude local user
//     const map = new Map();
//     const localId = this.state?.userData?._id;
//     arr.forEach(u => {
//       if (!u || !u._id) return;
//       if (u._id === localId) return;
//       if (!map.has(u._id)) map.set(u._id, u);
//       else {
//         const existing = map.get(u._id);
//         map.set(u._id, { ...existing, ...u });
//       }
//     });

//     // compute zone client-side for each user (important)
//     const result = Array.from(map.values()).map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
//     return result;
//   };

//   componentDidMount = async () => {
//     this._isMounted = true;
//     try {
//       const params = new URLSearchParams(window.location.search);
//       this.roomId = params.get("roomId") || "global";
//     } catch (err) {
//       console.warn("Error parsing roomId:", err);
//     }

//     await this.preloadImages([map_img, avatarSprite]);
//     this.mapImg.src = map_img;
//     this.spriteImg.src = avatarSprite;
//     this.interactiveZones = mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || [];
//     console.log("[Map] Interactables zones loaded:", this.interactiveZones.length);

//     window.addEventListener("keydown", this.handleKeyDown);
//     window.addEventListener("keyup", this.handleKeyUp);

//     await this.initUserAndSocket();
//     if (!this.socket) return;

//     const currentUser = this.state.userData;
//     if (currentUser && currentUser._id) {
//       this.setState(prev => ({
//         myAvatar: {
//           ...prev.myAvatar,
//           _id: currentUser._id,
//           name: currentUser.name,
//           width: prev.myAvatar.width || 50,
//           height: prev.myAvatar.height || 50,
//           avatar: currentUser.avatar || null
//         }
//       }));
//     }

//     this.startAnimationLoop();

//     // central file-shared listener
//     if (!this._fileSharedListenerAttached) {
//       this.socket.on("file-shared", (payload) => {
//         this.handleFileShared(payload);
//       });
//       this._fileSharedListenerAttached = true;
//     }

//     // video-toggle handler (UI-only)
//     this.socket.on("video-toggle", ({ userId, enabled }) => {
//       const peer = this.state.peers[userId];
//       if (!peer) return;
//       this.setState(prev => ({
//         peers: {
//           ...prev.peers,
//           [userId]: { ...peer, isVideoOn: enabled }
//         }
//       }));
//       const vidEl = document.getElementById(`video-${userId}`);
//       if (vidEl) vidEl.srcObject = enabled ? peer.stream : null;
//     });
//   };

//   componentWillUnmount() {
//     this._isMounted = false;
//     if (this.socket) {
//       try { this.socket.disconnect(); } catch(e) {}
//       this.socket = null;
//     }
//     window.removeEventListener("keydown", this.handleKeyDown);
//     window.removeEventListener("keyup", this.handleKeyUp);
//     if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

//     // stop local stream tracks
//     if (this.state.localStream) {
//       try {
//         this.state.localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
//       } catch (e) {}
//     }

//     // close peers
//     Object.keys(this.peerConnections).forEach(pid => {
//       try { this.peerConnections[pid].close(); } catch(e) {}
//       delete this.peerConnections[pid];
//     });

//     // reset state
//     try {
//       // avoid setState on unmounted but reset internal references
//       this.peerConnections = {};
//       this.dataChannels = {};
//     } catch (e) {}
//   }

//   // ---------------------
//   // Socket and user init
//   // ---------------------
//   initUserAndSocket = async () => {
//     try {
//       const profileRes = await fetch("http://localhost:5000/api/auth/me", { credentials: "include" });
//       if (!profileRes.ok) throw new Error("Not logged in");
//       const userData = await profileRes.json();
//       if (!this._isMounted) return;

//       this.setState(prev => ({
//         userData,
//         myAvatar: {
//           ...prev.myAvatar,
//           _id: userData._id,
//           name: userData.name,
//           width: prev.myAvatar.width,
//           height: prev.myAvatar.height,
//           avatar: userData.avatar || null
//         }
//       }));

//       const usersRes = await fetch("http://localhost:5000/api/users", { credentials: "include" });
//       const allUsers = (await usersRes.json()) || [];
//       this.allUsers = allUsers;
//       const offlineUsers = allUsers.filter(u => u._id !== userData._id);
//       if (this._isMounted) this.setState({ offlineUsers });

//       // Socket: include cookie or token if applicable
//       this.socket = io("http://localhost:5000", {
//         withCredentials: true,
//         transports: ["websocket"],
//         auth: { token: Cookies.get("jwt_token") } // optional, your server may read cookie directly
//       });

//       if (this.socket && !this._fileSharedListenerAttached) {
//         this.socket.on("file-shared", (payload) => this.handleFileShared(payload));
//         this._fileSharedListenerAttached = true;
//       }

//       this.socket.on("connect", () => {
//         this.socket.emit("joinRoom", { roomId: this.roomId, avatar: this.state.myAvatar });
//         console.log("[Socket] Connected and joined room:", this.roomId);
//       });

//       // currentPositions -> normalize -> compute zones client-side
//       this.socket.on("currentPositions", (usersObj) => {
//         let normalized = this.normalizeUsersList(usersObj || {});
//         // include self
//         const me = this.makeMeEntry();
//         if (me) normalized = Array.from(new Map([[me._id, me], ...normalized.map(u => [u._id, u])]).values());
//         // recompute zones (ensure up-to-date)
//         normalized = normalized.map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
//         if (this._isMounted) {
//           this.setState({ onlineUsers: normalized }, () => {
//             this.updateOfflineUsers(normalized);
//             this.checkProximityAndManagePeers();
//             console.log("[Socket] currentPositions -> onlineUsers set:", normalized);
//           });
//         }
//       });

//       this.socket.on("onlineUsers", (usersArr) => {
//         let normalized = this.normalizeUsersList(usersArr || []);
//         const me = this.makeMeEntry();
//         if (me) normalized = Array.from(new Map([[me._id, me], ...normalized.map(u => [u._id, u])]).values());
//         normalized = normalized.map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
//         if (this._isMounted) {
//           this.setState({ onlineUsers: normalized }, () => {
//             this.updateOfflineUsers(normalized);
//             this.checkProximityAndManagePeers();
//             console.log("[Socket] onlineUsers -> onlineUsers set:", normalized);
//           });
//         }
//       });

//       this.socket.on("userJoined", (user) => {
//         const uid = user._id || user.id || user.userId;
//         if (!uid || uid === this.state.userData?._id) return;
//         const newUser = {
//           _id: uid,
//           x: typeof user.x === "number" ? user.x : 100,
//           y: typeof user.y === "number" ? user.y : 100,
//           width: user.width || this.state.myAvatar.width,
//           height: user.height || this.state.myAvatar.height,
//           name: user.username || user.name || "User",
//           avatar: user.avatar || null,
//           stream: null
//         };
//         // compute zone
//         newUser.zone = this.computeZoneForUser(newUser);
//         this.setState(prev => {
//           if (prev.onlineUsers.find(u => u._id === uid)) return prev;
//           return { onlineUsers: [...prev.onlineUsers, newUser] };
//         }, () => {
//           this.updateOfflineUsers(this.state.onlineUsers);
//           this.checkProximityAndManagePeers();
//         });
//         console.log("[Socket] User joined:", uid);
//       });

//       this.socket.on("userMoved", (payload) => {
//         const id = payload.userId || payload._id || payload.id;
//         const x = payload.x;
//         const y = payload.y;
//         if (!id) return;
//         this.setState(prev => {
//           const updated = prev.onlineUsers.map(u => u._id === id ? ({ ...u, x, y, zone: this.computeZoneForUser({ ...u, x, y }) }) : u);
//           return { onlineUsers: updated };
//         }, () => {
//           this.checkProximityAndManagePeers();
//         });
//       });

//       this.socket.on("userLeft", (payload) => {
//         const id = payload.id || payload.userId || payload._id;
//         if (!id) return;

//         // Remove audio element if any
//         try {
//           const audioEl = document.getElementById(`audio-${id}`);
//           if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
//         } catch (e) {}

//         this.setState(prev => ({
//           onlineUsers: prev.onlineUsers.filter(u => u._id !== id),
//           peers: Object.fromEntries(Object.entries(prev.peers).filter(([pid]) => pid !== id))
//         }), () => {
//           this.checkProximityAndManagePeers();
//         });

//         if (this.peerConnections[id]) {
//           try { this.peerConnections[id].close(); } catch (e) {}
//           delete this.peerConnections[id];
//         }
//         if (this.dataChannels[id]) {
//           try { this.dataChannels[id].close?.(); } catch (e) {}
//           delete this.dataChannels[id];
//         }
//         console.log("[Socket] User left:", id);
//       });

//       // zoneUsers (server-provided list of users in our zone) -> we ensure p2p only for these ids
//       this.socket.on("zoneUsers", (zoneMembers) => {
//         try {
//           console.debug("zoneUsers payload:", zoneMembers);
//           const ids = (zoneMembers || []).map(m => m.userId || m._id || m.id).filter(Boolean);
//           // close peer connections not in ids
//           Object.keys(this.peerConnections).forEach(pid => { if (!ids.includes(pid)) this.handlePeerClose(pid); });
//           // ensure we have peerConnections for everyone in ids (except self)
//           ids.forEach(uid => {
//             if (uid === this.state.userData?._id) return;
//             if (!this.peerConnections[uid]) {
//               this.initiateConnection(uid).catch(err => console.warn("zoneUsers -> initiateConnection err", err));
//             }
//           });
//           this.setState(prev => ({ activeOverlayPeers: ids, connectedPeers: Object.keys(this.peerConnections) }));
//         } catch (err) { console.error("zoneUsers handler error:", err); }
//       });

//       // CHAT: server sends { from, fromName, message, zone }
//       // Client accepts server messages (server already filtered by zone)
// this.socket.on("chat", ({ from, message, zone }) => {
//   try {
//     const myId = this.state.userData?._id;

//     // Prevent sender from receiving duplicate message
//     if (from === myId) {
//       console.debug("Ignoring echo chat message from server");
//       return;
//     }

//     const fromName =
//       this.state.onlineUsers.find(u => u._id === from)?.name ||
//       "User";

//     this.setState(prev => ({
//       chatMessages: [
//         ...prev.chatMessages,
//         { fromId: from, fromName, text: message, ts: Date.now() }
//       ]
//     }));
//   } catch (err) {
//     console.error("chat handler error:", err);
//   }
// });


//       // ---------------------------
//       // SIGNALING: handle incoming signals (offer/answer/candidate)
//       // ---------------------------
//       this.socket.on("signal", async (msg) => {
//         try {
//           const from = msg.from || msg.userId || msg.id;
//           const type = msg.type || msg.signalType;
//           const data = msg.data;
//           if (!from || !type) return;

//           // Optionally: you can validate that 'from' is a user in same zone here.
//           if (type === "offer") {
//             await this.handleOffer(from, data);
//           } else if (type === "answer") {
//             await this.handleAnswer(from, data);
//           } else if (type === "candidate" || type === "ice-candidate") {
//             await this.handleCandidate(from, data);
//           } else {
//             console.debug("Unknown signal type:", type);
//           }
//         } catch (err) { console.error("signal handler error:", err); }
//       });

//       // file-broadcast fallback
//       this.socket.on("file-broadcast", ({ fromId, fromName, filename, mime, buffer }) => {
//         try {
//           const blob = new Blob([buffer], { type: mime || "application/octet-stream" });
//           const url = URL.createObjectURL(blob);
//           this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId, fromName, isFile: true, fileName: filename, fileUrl: url, ts: Date.now() }] }));
//         } catch (err) { console.warn("file-broadcast handle error:", err); }
//       });

//       console.log("[Init] Socket listeners attached.");
//     } catch (err) {
//       console.error("initUserAndSocket error:", err);
//     }
//   };

//   // helper: emit enterZone with userId + zone
//   sendEnterZone = (zone) => {
//     try {
//       const myId = this.state.userData?._id;
//       if (!this.socket || !myId || !zone) return;
//       this.socket.emit("enterZone", { userId: myId, zone });
//     } catch (err) { console.warn("sendEnterZone error:", err); }
//   };

//   sendLeaveZone = () => {
//     try { if (!this.socket) return; const myId = this.state.userData?._id; this.socket.emit("leaveZone", { userId: myId }); } catch (err) { console.warn("sendLeaveZone error:", err); }
//   };

//   makeMeEntry = () => {
//     const id = this.state?.userData?._id;
//     if (!id) return null;
//     const avatar = this.state.userData?.avatar || this.state.myAvatar?.avatar || null;
//     return {
//       _id: id,
//       x: (typeof this.state.myAvatar?.x === "number") ? this.state.myAvatar.x : (this.state.myAvatar?.x || 100),
//       y: (typeof this.state.myAvatar?.y === "number") ? this.state.myAvatar.y : (this.state.myAvatar?.y || 100),
//       width: this.state.myAvatar?.width || 50,
//       height: this.state.myAvatar?.height || 50,
//       name: this.state.userData?.name || this.state.myAvatar?.name || "Me",
//       avatar
//     };
//   };

//   updateOfflineUsers = (currentOnline = []) => {
//     if (!this._isMounted) return;
//     const onlineIds = currentOnline.map(u => u._id);
//     const updatedOffline = (this.allUsers || []).filter(u => u._id !== this.state.userData?._id && !onlineIds.includes(u._id));
//     this.setState({ offlineUsers: updatedOffline });
//   };

//   // --------------------------
//   // WebRTC: Create PeerConnection
//   // --------------------------
//   // createPeerConnection = (peerId, userInfo = {}) => {
//   //   if (this.peerConnections[peerId]) return this.peerConnections[peerId];

//   //   const pc = new RTCPeerConnection(ICE_CONFIG);
//   //   pc._makingOffer = false;

//   //   // Determine polite role deterministically:
//   //   // if myId > peerId (string comparison) make me polite (I will yield on collisions).
//   //   // This ensures both sides compute same polite role.
//   //   const myId = this.state.userData?._id || "";
//   //   pc._polite = String(myId) > String(peerId);
//   //   pc._ignoreOffer = false;

//   //   pc.ondatachannel = (event) => {
//   //     const dc = event.channel;
//   //     this.setupDataChannel(peerId, dc);
//   //   };

//   //   pc.ontrack = (event) => {
//   //     const remoteStream = event.streams[0];
//   //     // update peers state with stream
//   //     this.setState(prev => ({
//   //       peers: {
//   //         ...prev.peers,
//   //         [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: remoteStream, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" }
//   //       }
//   //     }), () => {
//   //       // attach stream to <video> if exists, otherwise create hidden audio element
//   //       const videoEl = document.getElementById(`video-${peerId}`);
//   //       if (videoEl) {
//   //         if (videoEl.srcObject !== remoteStream) videoEl.srcObject = remoteStream;
//   //         videoEl.muted = false;
//   //         videoEl.play().catch(err => console.warn("videoEl.play() blocked:", err));
//   //       } else {
//   //         let audioEl = document.getElementById(`audio-${peerId}`);
//   //         if (!audioEl) {
//   //           audioEl = document.createElement("audio");
//   //           audioEl.id = `audio-${peerId}`;
//   //           audioEl.autoplay = true;
//   //           audioEl.playsInline = true;
//   //           audioEl.style.display = "none";
//   //           document.body.appendChild(audioEl);
//   //         }
//   //         if (audioEl.srcObject !== remoteStream) audioEl.srcObject = remoteStream;
//   //         audioEl.muted = false;
//   //         audioEl.play().catch(err => console.warn("audioEl.play() blocked:", err));
//   //       }
//   //     });
//   //   };

//   //   pc.onicecandidate = (event) => {
//   //     if (event.candidate) {
//   //       try {
//   //         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "candidate", data: event.candidate });
//   //       } catch (e) { console.warn("socket missing when sending candidate", e); }
//   //     }
//   //   };

//   //   pc.onconnectionstatechange = () => {
//   //     const state = pc.connectionState;
//   //     if (state === "disconnected" || state === "failed" || state === "closed") {
//   //       if (this.peerConnections[peerId]) {
//   //         try { this.peerConnections[peerId].close(); } catch (e) {}
//   //         delete this.peerConnections[peerId];
//   //       }
//   //       if (this.dataChannels[peerId]) {
//   //         try { this.dataChannels[peerId].close?.(); } catch (e) {}
//   //         delete this.dataChannels[peerId];
//   //       }
//   //       try {
//   //         const audioEl = document.getElementById(`audio-${peerId}`);
//   //         if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
//   //       } catch (e) {}

//   //       this.setState(prev => {
//   //         const newPeers = { ...prev.peers }; delete newPeers[peerId];
//   //         return { peers: newPeers, connectedPeers: Object.keys(this.peerConnections) };
//   //       });
//   //     }
//   //   };

//   //   pc.oniceconnectionstatechange = () => {
//   //     console.log("[pc.oniceconnectionstatechange]", peerId, pc.iceConnectionState);
//   //   };

//   //   pc.onnegotiationneeded = async () => {
//   //     // IMPORTANT: only create an offer if signalingState is stable to avoid collisions
//   //     try {
//   //       if (pc._makingOffer) return;
//   //       if (pc.signalingState !== "stable") {
//   //         // skip negotiation if not stable
//   //         console.debug("[onnegotiationneeded] skipping because signalingState not stable:", pc.signalingState);
//   //         return;
//   //       }
//   //       pc._makingOffer = true;
//   //       const offer = await pc.createOffer();
//   //       await pc.setLocalDescription(offer);
//   //       this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//   //     } catch (err) {
//   //       console.warn("onnegotiationneeded error for", peerId, err);
//   //     } finally {
//   //       pc._makingOffer = false;
//   //     }
//   //   };

//   //   this.peerConnections[peerId] = pc;
//   //   this.setState(prev => ({ peers: { ...prev.peers, [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: prev.peers[peerId]?.stream || null, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" } } }));
//   //   return pc;
//   // };
//   createPeerConnection = (peerId, userInfo = {}) => {
//   if (this.peerConnections[peerId]) return this.peerConnections[peerId];

//   const pc = new RTCPeerConnection(ICE_CONFIG);
//   pc._makingOffer = false;
//   pc._polite = String(this.state.userData?._id || "") > String(peerId); // deterministic polite role
//   pc._ignoreOffer = false;
//   pc._pendingCandidates = []; // queue candidates arriving early

//   // Data channel created by remote -> attach handler
//   pc.ondatachannel = (ev) => this.setupDataChannel(peerId, ev.channel);

//   // Remote media tracks -> update state + attach to elements
//   pc.ontrack = (ev) => {
//     const remoteStream = ev.streams && ev.streams[0];
//     this.setState(prev => ({
//       peers: {
//         ...prev.peers,
//         [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: remoteStream, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" }
//       }
//     }), () => {
//       const videoEl = document.getElementById(`video-${peerId}`);
//       if (videoEl && remoteStream) {
//         if (videoEl.srcObject !== remoteStream) videoEl.srcObject = remoteStream;
//         videoEl.muted = false;
//         videoEl.play().catch(() => {});
//       } else if (remoteStream) {
//         // fallback: create hidden audio element for audio-only peers
//         let audioEl = document.getElementById(`audio-${peerId}`);
//         if (!audioEl) {
//           audioEl = document.createElement("audio");
//           audioEl.id = `audio-${peerId}`;
//           audioEl.autoplay = true;
//           audioEl.playsInline = true;
//           audioEl.style.display = "none";
//           document.body.appendChild(audioEl);
//         }
//         if (audioEl.srcObject !== remoteStream) audioEl.srcObject = remoteStream;
//         audioEl.muted = false;
//         audioEl.play().catch(() => {});
//       }
//     });
//   };

//   // Send ICE candidates to signaling server
//   pc.onicecandidate = (ev) => {
//     if (ev.candidate) {
//       try {
//         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "candidate", data: ev.candidate });
//       } catch (e) { console.warn("socket missing when sending candidate", e); }
//     }
//   };

//   // Connection state handling and cleanup
//   pc.onconnectionstatechange = () => {
//     const s = pc.connectionState;
//     console.debug("[pc.connstate]", peerId, s);
//     if (s === "disconnected" || s === "failed" || s === "closed") {
//       try { pc.close(); } catch(e) {}
//       delete this.peerConnections[peerId];
//       if (this.dataChannels[peerId]) { try { this.dataChannels[peerId].close?.(); } catch(e){} delete this.dataChannels[peerId]; }
//       try { const audioEl = document.getElementById(`audio-${peerId}`); if (audioEl) { audioEl.srcObject = null; audioEl.remove(); } } catch(e){}
//       this.setState(prev => {
//         const newPeers = { ...prev.peers }; delete newPeers[peerId];
//         return { peers: newPeers, connectedPeers: Object.keys(this.peerConnections) };
//       });
//     }
//   };

//   pc.oniceconnectionstatechange = () => console.log("[pc.oniceconnectionstatechange]", peerId, pc.iceConnectionState);

//   // Only create offers when signalingState is stable (avoid collisions)
//   pc.onnegotiationneeded = async () => {
//     try {
//       if (pc._makingOffer) return;
//       if (pc.signalingState !== "stable") return;
//       pc._makingOffer = true;
//       const offer = await pc.createOffer();
//       await pc.setLocalDescription(offer);
//       this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//     } catch (err) {
//       console.warn("onnegotiationneeded error for", peerId, err);
//     } finally {
//       pc._makingOffer = false;
//     }
//   };

//   this.peerConnections[peerId] = pc;
//   this.setState(prev => ({ peers: { ...prev.peers, [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: prev.peers[peerId]?.stream || null, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" } } }));
//   return pc;
// };

//   // setupDataChannel = (peerId, dc) => {
//   //   this.dataChannels[peerId] = dc;
//   //   dc.binaryType = "arraybuffer";
//   //   dc.onopen = () => console.log(`[DataChannel] open for ${peerId}`);
//   //   dc.onclose = () => { console.log(`[DataChannel] closed for ${peerId}`); delete this.dataChannels[peerId]; };
//   //   dc.onerror = (e) => console.warn("[DataChannel] error", e);

//   //   dc.onmessage = (ev) => {
//   //     try {
//   //       if (typeof ev.data === "string") {
//   //         const msg = JSON.parse(ev.data);
//   //         if (msg && msg.type === "file-meta") {
//   //           this.incomingFiles[msg.fileId] = { meta: msg, receivedSize: 0, chunks: [] };
//   //         }
//   //       } else if (ev.data instanceof ArrayBuffer) {
//   //         const entries = Object.entries(this.incomingFiles);
//   //         if (entries.length === 0) return;
//   //         let targetFileId = null;
//   //         for (const [fid, rec] of entries) {
//   //           if (rec.receivedSize < rec.meta.size) { targetFileId = fid; break; }
//   //         }
//   //         if (!targetFileId) return;
//   //         const rec = this.incomingFiles[targetFileId];
//   //         rec.chunks.push(ev.data);
//   //         rec.receivedSize += ev.data.byteLength;
//   //         if (rec.receivedSize >= rec.meta.size) {
//   //           const blob = new Blob(rec.chunks, { type: rec.meta.mime || "application/octet-stream" });
//   //           const url = URL.createObjectURL(blob);
//   //           const fromName = this.state.onlineUsers.find(u => u._id === peerId)?.name || peerId;
//   //           this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: peerId, fromName, isFile: true, fileName: rec.meta.filename, fileUrl: url, ts: Date.now() }] }));
//   //           delete this.incomingFiles[targetFileId];
//   //           console.log("[DataChannel] file received complete", rec.meta.filename);
//   //         }
//   //       }
//   //     } catch (err) { console.error("DataChannel onmessage error:", err); }
//   //   };
//   // };

//   // helper: polite renegotiate for an existing peer after adding tracks
  
  
// /**
//  * Setup datachannel (file transfer)
//  */
// setupDataChannel = (peerId, dc) => {
//   this.dataChannels[peerId] = dc;
//   dc.binaryType = "arraybuffer";
//   dc.onopen = () => console.log(`[DataChannel] open for ${peerId}`);
//   dc.onclose = () => { console.log(`[DataChannel] closed for ${peerId}`); delete this.dataChannels[peerId]; };
//   dc.onerror = (e) => console.warn("[DataChannel] error", e);

//   dc.onmessage = (ev) => {
//     try {
//       if (typeof ev.data === "string") {
//         const msg = JSON.parse(ev.data);
//         if (msg?.type === "file-meta") this.incomingFiles[msg.fileId] = { meta: msg, receivedSize: 0, chunks: [] };
//       } else if (ev.data instanceof ArrayBuffer) {
//         // assemble file chunks (same logic as your code)
//         const entries = Object.entries(this.incomingFiles);
//         if (!entries.length) return;
//         let targetFileId = null;
//         for (const [fid, rec] of entries) { if (rec.receivedSize < rec.meta.size) { targetFileId = fid; break; } }
//         if (!targetFileId) return;
//         const rec = this.incomingFiles[targetFileId];
//         rec.chunks.push(ev.data);
//         rec.receivedSize += ev.data.byteLength;
//         if (rec.receivedSize >= rec.meta.size) {
//           const blob = new Blob(rec.chunks, { type: rec.meta.mime || "application/octet-stream" });
//           const url = URL.createObjectURL(blob);
//           const fromName = this.state.onlineUsers.find(u => u._id === peerId)?.name || peerId;
//           this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: peerId, fromName, isFile: true, fileName: rec.meta.filename, fileUrl: url, ts: Date.now() }] }));
//           delete this.incomingFiles[targetFileId];
//           console.log("[DataChannel] file received complete", rec.meta.filename);
//         }
//       }
//     } catch (err) { console.error("DataChannel onmessage error:", err); }
//   };
// };


//   // renegotiatePeer = async (pc, peerId) => {
//   //   if (!pc || !this.socket) return;
//   //   try {
//   //     // only try if signaling state is stable to avoid collision
//   //     if (pc.signalingState && pc.signalingState !== "stable") return;
//   //     if (pc._makingOffer) return;
//   //     pc._makingOffer = true;
//   //     const offer = await pc.createOffer();
//   //     await pc.setLocalDescription(offer);
//   //     this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//   //   } catch (err) {
//   //     console.warn("renegotiatePeer error for", peerId, err);
//   //   } finally {
//   //     try { pc._makingOffer = false; } catch (e) {}
//   //   }
//   // };

//   // Initiate (create offer)
  
//   renegotiatePeer = async (pc, peerId) => {
//   if (!pc || !this.socket) return;
//   try {
//     if (pc.signalingState && pc.signalingState !== "stable") return;
//     if (pc._makingOffer) return;
//     pc._makingOffer = true;
//     const offer = await pc.createOffer();
//     await pc.setLocalDescription(offer);
//     this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//   } catch (err) {
//     console.warn("renegotiatePeer error for", peerId, err);
//   } finally {
//     try { pc._makingOffer = false; } catch (e) {}
//   }
// };
  
//   // initiateConnection = async (peerId, userInfo = {}) => {
//   //   const pc = this.createPeerConnection(peerId, userInfo);
//   //   try {
//   //     const localStream = this.state.localStream;
//   //     if (localStream) {
//   //       localStream.getTracks().forEach(track => {
//   //         if (!pc.getSenders().some(s => s.track === track)) {
//   //           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack err", e); }
//   //         }
//   //       });
//   //     }

//   //     try {
//   //       if (!this.dataChannels[peerId]) {
//   //         const dc = pc.createDataChannel("file");
//   //         this.setupDataChannel(peerId, dc);
//   //       }
//   //     } catch (e) {
//   //       console.warn("createDataChannel err (may be fine if remote created one):", e);
//   //     }

//   //     if (typeof pc._makingOffer === "undefined") pc._makingOffer = false;

//   //     // create an offer only if signalingState is stable (avoid collisions)
//   //     if (!pc._makingOffer && pc.signalingState === "stable") {
//   //       pc._makingOffer = true;
//   //       try {
//   //         const offer = await pc.createOffer();
//   //         await pc.setLocalDescription(offer);
//   //         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//   //       } finally {
//   //         pc._makingOffer = false;
//   //       }
//   //     } else {
//   //       console.debug("Skipped initiating offer because pc not stable or already makingOffer", peerId, pc.signalingState);
//   //     }

//   //     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
//   //   } catch (err) {
//   //     console.error("[WebRTC] Failed to initiate connection:", err);
//   //     try { if (pc) pc._makingOffer = false; } catch(e){}
//   //   }
//   // };

//   // SAFE helpers to setRemoteDescription / addIceCandidate with fallbacks
  
//   /**
//  * Initiate connection (create data channel + add local tracks + create offer if stable)
//  */
// initiateConnection = async (peerId, userInfo = {}) => {
//   const pc = this.createPeerConnection(peerId, userInfo);
//   try {
//     const localStream = this.state.localStream;
//     if (localStream) {
//       localStream.getTracks().forEach(track => {
//         if (!pc.getSenders().some(s => s.track === track)) {
//           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack err", e); }
//         }
//       });
//     }

//     try {
//       if (!this.dataChannels[peerId]) {
//         const dc = pc.createDataChannel("file");
//         this.setupDataChannel(peerId, dc);
//       }
//     } catch (e) { console.warn("createDataChannel err:", e); }

//     if (typeof pc._makingOffer === "undefined") pc._makingOffer = false;

//     if (!pc._makingOffer && pc.signalingState === "stable") {
//       pc._makingOffer = true;
//       try {
//         const offer = await pc.createOffer();
//         await pc.setLocalDescription(offer);
//         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
//       } finally { pc._makingOffer = false; }
//     } else {
//       console.debug("Skip creating offer (not stable or already makingOffer)", peerId, pc.signalingState);
//     }

//     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
//   } catch (err) {
//     console.error("[WebRTC] initiateConnection failed:", err);
//     try { if (pc) pc._makingOffer = false; } catch(e){}
//   }
// };


  
//   // safeSetRemoteDescription = async (pc, desc) => {
//   //   if (!pc) return;
//   //   try {
//   //     await pc.setRemoteDescription(desc);
//   //   } catch (err) {
//   //     try {
//   //       // try using constructors if plain object fails
//   //       await pc.setRemoteDescription(new RTCSessionDescription(desc));
//   //     } catch (e2) {
//   //       throw e2;
//   //     }
//   //   }
//   // };

//   // safeAddIceCandidate = async (pc, cand) => {
//   //   if (!pc) return;
//   //   try {
//   //     await pc.addIceCandidate(cand);
//   //   } catch (err) {
//   //     try {
//   //       await pc.addIceCandidate(new RTCIceCandidate(cand));
//   //     } catch (e2) {
//   //       // non-fatal: candidate may be malformed or arrive early; log and continue
//   //       console.warn("safeAddIceCandidate second attempt failed:", e2);
//   //     }
//   //   }
//   // };

//   // // HANDLE OFFER (perfect negotiation)
//   // handleOffer = async (fromId, offer) => {
//   //   try {
//   //     const pc = this.createPeerConnection(fromId);
//   //     // collision detection
//   //     const makingOffer = !!pc._makingOffer;
//   //     const notStable = pc.signalingState !== "stable";
//   //     const offerCollision = makingOffer || notStable;

//   //     // If we are impolite and there is an offer collision -> ignore the offer
//   //     if (!pc._polite && offerCollision) {
//   //       console.warn("[handleOffer] Ignoring offer due to collision (impolite)", fromId, { signalingState: pc.signalingState, _makingOffer: pc._makingOffer });
//   //       return;
//   //     }

//   //     if (offerCollision) {
//   //       // polite peer: perform rollback before applying remote offer
//   //       try {
//   //         await pc.setLocalDescription({ type: "rollback" });
//   //       } catch (rbErr) {
//   //         console.warn("rollback failed:", rbErr);
//   //       }
//   //     }

//   //     // Accept the offer (use safe helper)
//   //     await this.safeSetRemoteDescription(pc, offer);

//   //     // ensure local tracks are added (if we want to send media)
//   //     if (this.state.isVideoOn || this.state.isAudioOn) {
//   //       if (!this.state.localStream) await this.ensureLocalStream();
//   //       const localStream = this.state.localStream;
//   //       localStream.getTracks().forEach(track => {
//   //         if (!pc.getSenders().some(s => s.track === track)) {
//   //           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack while answering err", e); }
//   //         }
//   //       });
//   //     }

//   //     const answer = await pc.createAnswer();
//   //     await pc.setLocalDescription(answer);
//   //     this.socket.emit("signal", { from: this.state.myAvatar._id, to: fromId, type: "answer", data: answer });
//   //     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
//   //   } catch (err) {
//   //     console.error(`[WebRTC] Error handling offer from ${fromId}:`, err);
//   //   }
//   // };

//   // handleAnswer = async (fromId, answer) => {
//   //   try {
//   //     const pc = this.peerConnections[fromId];
//   //     if (!pc) return console.error(`[WebRTC] No connection found for ${fromId}`);
//   //     // Safe setRemoteDescription with fallback
//   //     await this.safeSetRemoteDescription(pc, answer);
//   //   } catch (err) {
//   //     console.error("[WebRTC] setRemoteDescription failed for answer from", fromId, err);
//   //   }
//   // };

//   // handleCandidate = async (fromId, candidate) => {
//   //   try {
//   //     const pc = this.peerConnections[fromId];
//   //     if (!pc || !candidate) return;
//   //     await this.safeAddIceCandidate(pc, candidate);
//   //   } catch (err) {
//   //     console.error("[WebRTC] addIceCandidate failed from", fromId, err);
//   //   }
//   // };


  
// safeSetRemoteDescription = async (pc, desc) => {
//   if (!pc) return;
//   try {
//     // Accept either plain object or RTCSessionDescription
//     await pc.setRemoteDescription(desc);
//   } catch (err) {
//     try {
//       await pc.setRemoteDescription(new RTCSessionDescription(desc));
//     } catch (e2) { throw e2; }
//   }

//   // Drain any queued ICE candidates after remote description is set
//   if (pc._pendingCandidates && pc._pendingCandidates.length) {
//     const pending = pc._pendingCandidates.splice(0);
//     for (const cand of pending) {
//       try { await pc.addIceCandidate(cand); } catch (e) { console.warn("drain candidate failed:", e); }
//     }
//   }
// };

// safeAddIceCandidate = async (pc, cand) => {
//   if (!pc || !cand) return;
//   // If remote description not yet applied, queue candidate
//   const remoteDescPresent = !!(pc.remoteDescription && pc.remoteDescription.type);
//   try {
//     if (!remoteDescPresent) {
//       pc._pendingCandidates = pc._pendingCandidates || [];
//       pc._pendingCandidates.push(cand);
//       return;
//     }
//     await pc.addIceCandidate(cand);
//   } catch (err) {
//     try { await pc.addIceCandidate(new RTCIceCandidate(cand)); }
//     catch (e2) {
//       // Non-fatal; log and continue
//       console.warn("safeAddIceCandidate second attempt failed:", e2);
//     }
//   }
// };


// /* ---------- Offer / Answer / Candidate handlers (perfect negotiation) ---------- */

// handleOffer = async (fromId, offer) => {
//   try {
//     const pc = this.createPeerConnection(fromId);
//     // collision detection
//     const makingOffer = !!pc._makingOffer;
//     const notStable = pc.signalingState !== "stable";
//     const offerCollision = makingOffer || notStable;

//     // If we are impolite and there is an offer collision -> ignore the offer
//     if (!pc._polite && offerCollision) {
//       pc._ignoreOffer = true;
//       console.warn("[handleOffer] Ignoring offer due to collision (impolite)", fromId, { signalingState: pc.signalingState, _makingOffer: pc._makingOffer });
//       return;
//     }
//     pc._ignoreOffer = false;

//     if (offerCollision) {
//       // polite peer: rollback local description if needed
//       try { await pc.setLocalDescription({ type: "rollback" }); } catch (rbErr) { console.warn("rollback failed:", rbErr); }
//     }

//     // Apply remote offer (use safe helper)
//     await this.safeSetRemoteDescription(pc, offer);

//     // Add local tracks if we want to send audio/video
//     if (this.state.isVideoOn || this.state.isAudioOn) {
//       if (!this.state.localStream) await this.ensureLocalStream();
//       const localStream = this.state.localStream;
//       localStream.getTracks().forEach(track => {
//         if (!pc.getSenders().some(s => s.track === track)) {
//           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack while answering err", e); }
//         }
//       });
//     }

//     const answer = await pc.createAnswer();
//     await pc.setLocalDescription(answer);
//     this.socket.emit("signal", { from: this.state.myAvatar._id, to: fromId, type: "answer", data: answer });
//     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
//   } catch (err) {
//     console.error(`[WebRTC] handleOffer error from ${fromId}:`, err);
//   }
// };

// handleAnswer = async (fromId, answer) => {
//   try {
//     const pc = this.peerConnections[fromId];
//     if (!pc) return console.error(`[WebRTC] No pc for answer from ${fromId}`);
//     await this.safeSetRemoteDescription(pc, answer);
//   } catch (err) {
//     console.error("[WebRTC] handleAnswer failed:", err);
//   }
// };

// handleCandidate = async (fromId, candidate) => {
//   try {
//     const pc = this.peerConnections[fromId];
//     if (!pc) {
//       console.warn("handleCandidate: no pc yet, creating one to queue candidate", fromId);
//       // create stub pc so candidate can be queued
//       this.createPeerConnection(fromId);
//     }
//     await this.safeAddIceCandidate(this.peerConnections[fromId], candidate);
//   } catch (err) {
//     console.error("[WebRTC] handleCandidate failed:", err);
//   }
// };
//   cleanupWebRTC = () => {
//     Object.keys(this.peerConnections).forEach(pid => {
//       try { this.peerConnections[pid].close(); } catch(e) {}
//       delete this.peerConnections[pid];
//     });
//     Object.keys(this.dataChannels).forEach(pid => {
//       try { this.dataChannels[pid].close?.(); } catch(e) {}
//       delete this.dataChannels[pid];
//     });
//     if (this.state.localStream) {
//       try { this.state.localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} }); } catch(e){}
//     }
//     document.querySelectorAll('video[id^="video-"]').forEach(el => { try { el.srcObject = null; } catch(e){} });
//     document.querySelectorAll('audio[id^="audio-"]').forEach(el => { try { el.srcObject = null; el.remove(); } catch(e){} });

//     this.setState({
//       peers: {},
//       connectedPeers: [],
//       localStream: null,
//       isAudioOn: false,
//       isVideoOn: false,
//       showVideo: false,
//       activeOverlayPeers: []
//     });
//   };

//   enableAudioPlayback = async () => {
//     const els = document.querySelectorAll('video[id^="video-"], audio[id^="audio-"]');
//     for (const el of els) {
//       try {
//         const isLocal = el.id === `video-${this.state.userData?._id}`;
//         if (!isLocal) el.muted = false;
//         await el.play();
//       } catch (err) { console.warn("enableAudioPlayback: play blocked for", el.id, err); }
//     }
//     try { if (window.audioContext && typeof window.audioContext.resume === "function") await window.audioContext.resume(); } catch(e){}
//   }

//   ensureLocalStream = async () => {
//     if (this.state.localStream) return this.state.localStream;
//     try {
//       // Request both audio+video; callers may disable tracks later
//       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//       if (!this._isMounted) { stream.getTracks().forEach(t => t.stop()); return null; }
//       this.setState({ localStream: stream, isAudioOn: true, isVideoOn: true }, () => {
//         const localVideo = document.getElementById(`video-${this.state.userData?._id}`);
//         if (localVideo) localVideo.srcObject = stream;
//       });
//       return stream;
//     } catch (err) {
//       console.warn("Failed to get user media:", err);
//       // Friendly user notice
//       try { alert("Could not access camera/mic. Please check permissions and reload the page."); } catch(e){}
//       return null;
//     }
//   };

//   // Toggle video: safer — enable/disable tracks and renegotiate if necessary
//   toggleVideo = async () => {
//     const currentlyOn = this.state.isVideoOn;
//     if (!currentlyOn) {
//       // enable video
//       let stream = this.state.localStream;
//       if (!stream) {
//         stream = await this.ensureLocalStream();
//         if (!stream) return;
//       }
//       // enable video tracks (if they exist) or get new stream
//       const videoTracks = stream.getVideoTracks();
//       if (videoTracks.length === 0) {
//         // rare case: we lost tracks, re-acquire
//         stream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
//         stream = await this.ensureLocalStream();
//         if (!stream) return;
//       } else {
//         videoTracks.forEach(t => t.enabled = true);
//       }

//       // attach/ensure tracks are added to peer connections and renegotiate
//       const nearbyIds = this.state.activeOverlayPeers || [];
//       for (const pid of nearbyIds) {
//         try {
//           const pc = this.createPeerConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
//           stream.getVideoTracks().forEach(track => {
//             if (!pc.getSenders().some(s => s.track === track)) {
//               try { pc.addTrack(track, stream); } catch (e) { console.warn(e); }
//             }
//           });
//           // politely renegotiate if remoteDescription already present
//           if (pc.remoteDescription && pc.remoteDescription.type) {
//             await this.renegotiatePeer(pc, pid);
//           } else {
//             // if we don't have remoteDescription, initiating connection will create offer
//             await this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
//           }
//         } catch (e) { console.warn("toggleVideo - error connecting to", pid, e); }
//       }

//       this.setState({ isVideoOn: true, showVideo: true }, () => {
//         try { this.socket.emit("video-toggle", { userId: this.state.myAvatar._id, enabled: true }); } catch (e) {}
//       });
//     } else {
//       // turn off video (disable tracks but do not stop them — keeps re-enable reliable)
//       if (this.state.localStream) {
//         try {
//           this.state.localStream.getVideoTracks().forEach(t => t.enabled = false);
//         } catch (e) { console.warn("toggleVideo off error", e); }
//       }
//       this.setState({ isVideoOn: false }, () => {
//         try { this.socket.emit("video-toggle", { userId: this.state.myAvatar._id, enabled: false }); } catch (e) {}
//       });
//     }
//   };

//   toggleAudio = async () => {
//     const currentlyOn = this.state.isAudioOn;
//     if (!currentlyOn) {
//       if (!this.state.localStream) await this.ensureLocalStream();
//       if (this.state.localStream) {
//         this.state.localStream.getAudioTracks().forEach(t => t.enabled = true);
//         const nearbyIds = this.state.activeOverlayPeers || [];
//         for (const pid of nearbyIds) {
//           try {
//             const pc = this.createPeerConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
//             this.state.localStream.getAudioTracks().forEach(track => {
//               if (!pc.getSenders().some(s => s.track === track)) {
//                 try { pc.addTrack(track, this.state.localStream); } catch (e) { console.warn(e); }
//               }
//             });
//             if (pc.remoteDescription && pc.remoteDescription.type) await this.renegotiatePeer(pc, pid);
//             else await this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
//           } catch (e) { console.warn("toggleAudio err", e); }
//         }
//       }
//       this.setState({ isAudioOn: true });
//     } else {
//       if (this.state.localStream) this.state.localStream.getAudioTracks().forEach(t => t.enabled = false);
//       this.setState({ isAudioOn: false });
//     }
//   };

//   // FILE helpers (unchanged)
//   sendFile = async (file) => {
//     if (!file) return;
//     const fromId = this.state.userData?._id || this.state.myAvatar?._id || "me";
//     const fromName = this.state.userData?.name || this.state.myAvatar?.name || "Me";
//     const pendingId = `p-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
//     const localUrl = URL.createObjectURL(file);
//     this.setState(prev => ({ chatMessages: [...prev.chatMessages, { _pendingId: pendingId, fromId, fromName, isFile: true, fileName: file.name, fileUrl: localUrl, uploading: true, ts: Date.now() }] }));

//     try {
//       const fd = new FormData();
//       fd.append("file", file);
//       fd.append("roomId", this.roomId || "");
//       fd.append("fromId", fromId);      // helpful metadata
//       fd.append("fromName", fromName);
//       fd.append("token", Cookies.get("jwt_token") || "");
//       fd.append("zone", this.currentZone || "");

//       const res = await fetch("http://localhost:5000/api/files/upload", {
//         method: "POST",
//         body: fd,
//         credentials: "include"
//       });
//       if (!res.ok) {
//         const txt = await res.text().catch(()=>null);
//         throw new Error(`Upload failed: ${res.status} ${txt||""}`);
//       }
//       const data = await res.json();
//       const fileUrl = data.fileUrl ? (data.fileUrl.startsWith("http") ? data.fileUrl : `https://major-project-backend-u1ju.onrender.com${data.fileUrl}`) : `https://major-project-backend-u1ju.onrender.com/api/files/${data.fileId}`;
//       this.setState(prev => ({ chatMessages: prev.chatMessages.map(m => m._pendingId === pendingId ? ({ fromId, fromName, isFile: true, fileName: data.fileName || file.name, fileUrl, fileId: data.fileId, uploading: false, ts: Date.now() }) : m) }));
//     } catch (err) {
//       console.error("sendFile upload error:", err);
//       this.setState(prev => ({ chatMessages: prev.chatMessages.map(m => m._pendingId === pendingId ? ({ ...m, uploading: false, uploadError: err.message || "Upload failed" }) : m) }));
//     }
//   };

//   sendFileToPeer = (peerId, file) => {
//     return new Promise(async (resolve, reject) => {
//       const dc = this.dataChannels[peerId];
//       if (!dc) return reject(new Error("No data channel to peer " + peerId));
//       if (dc.readyState !== "open") {
//         const waitOpen = new Promise((res, rej) => {
//           const to = setTimeout(() => rej(new Error("DataChannel open timeout")), 5000);
//           const onopen = () => { clearTimeout(to); dc.removeEventListener("open", onopen); res(); };
//           dc.addEventListener("open", onopen);
//         });
//         try { await waitOpen; } catch (err) { return reject(err); }
//       }

//       const fileId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
//       const meta = { type: "file-meta", fileId, filename: file.name, size: file.size, mime: file.type || "application/octet-stream" };
//       try { dc.send(JSON.stringify(meta)); } catch (err) { return reject(err); }

//       try {
//         const reader = file.stream ? file.stream().getReader() : null;
//         if (reader) {
//           const pump = async () => {
//             while (true) {
//               const { done, value } = await reader.read();
//               if (done) break;
//               dc.send(value.buffer || value);
//             }
//           };
//           await pump();
//           resolve();
//         } else {
//           let offset = 0;
//           while (offset < file.size) {
//             const slice = file.slice(offset, offset + FILE_CHUNK_SIZE);
//             const ab = await slice.arrayBuffer();
//             dc.send(ab);
//             offset += ab.byteLength;
//           }
//           resolve();
//         }
//       } catch (err) { reject(err); }
//     });
//   };

//   // UI + rendering
//   render() {
//     const { onlineUsers, offlineUsers, isSidebarCollapsed, showChatPanel, chatMessages, activeTab, peers, userData, localStream, isAudioOn, isVideoOn } = this.state;
//     const zoneUserIds = new Set([this.state.userData?._id, ...(this.state.activeOverlayPeers || [])]);
//     return (
//       <div className="meeting-container">
//         <div className="meeting-header">
//           <div className="meeting-icons-container"><FaHome className="meeting-icons" /></div>
//           <div className="meeting-top-controls">
//             <button onClick={this.toggleAudio} className="icon-btn"><IoMdMic style={{ color: isAudioOn ? "green" : "red" }} /></button>
//             <button onClick={this.toggleVideo} className="icon-btn"><FaVideo style={{ color: isVideoOn ? "green" : "red" }} /></button>
//             <button onClick={() => this.setState(prev => ({ showChatPanel: !prev.showChatPanel }))} className="icon-btn"><FiMessageCircle /></button>
//           </div>
//         </div>

//         <div className="meeting-body-container">
//           <div className={`meeting-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
//             {!isSidebarCollapsed && (
//               <div className="sidebar-tabs">
//                 <button className={activeTab === "users" ? "active-tab" : ""} onClick={() => this.setState({ activeTab: "users" })}>Users</button>
//                 <button className={activeTab === "meeting" ? "active-tab" : ""} onClick={() => this.setState({ activeTab: "meeting" })}>Meeting</button>
//               </div>
//             )}

//             {!isSidebarCollapsed && (
//               <div className="sidebar-tab-content">
//                 {activeTab === "users" ? (
//                   <>
//                     <h2 className="meeting-heading">Online</h2>
//                     <div className="meeting-online">{onlineUsers.map(u => (
//                       <div className="meeting-user" key={u._id}>
//                         <img className="meeting-img" src={u.avatar || avatarSprite} alt="avatar" />
//                         <p className="userName">{u._id === userData?._id ? `${u.name} (You)` : u.name}</p>
//                         <span className="status-dot green" />
//                       </div>
//                     ))}</div>

//                     <h2 className="meeting-heading">Offline</h2>
//                     <div className="meeting-offline">{offlineUsers.map(u => (
//                       <div className="meeting-user" key={u._id}>
//                         <img className="meeting-img" src={u.avatar || avatarSprite} alt="avatar" />
//                         <p className="userName">{u.name}</p>
//                         <span className="status-dot red" />
//                       </div>
//                     ))}</div>
//                   </>
//                 ) : (
//                   <div className="meeting-users-box">
//                     { [...new Map([...onlineUsers, userData].filter(Boolean).filter((u) => zoneUserIds.has(u._id)).map((u) => [u._id, u])).values(),].map((u) => {
//                       const peer = peers[u._id];
//                       const isLocal = u._id === userData?._id;
//                       const stream = isLocal ? localStream : peer?.stream;
//                       return (
//                         <div key={u._id} className="meeting-user-box">
//                           {stream ? (
//                             <video id={`video-${u._id}`} autoPlay playsInline muted={isLocal} className="meeting-user-video" ref={el => { if (el && stream && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}); } }} />
//                           ) : (<p className="meeting-user-name">{u.name}</p>)}
//                         </div>
//                       );
//                     })}
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>

//           <div className={`meeting-map-column ${isSidebarCollapsed ? "expanded" : ""}`}>
//             <div className="meeting-map-container">
//               <canvas id="mapCanvas" width={800} height={600} style={{ width: "100%", height: "100%" }} />
//             </div>
//           </div>

//           {showChatPanel && (
//             <div className="overlay-chat-panel">
//               <div className="chat-header">
//                 <span className="chat-title">Chat</span>
//                 <div className="chat-header-icons"><FiX className="chat-header-icon" onClick={() => this.setState({ showChatPanel: false })} /></div>
//               </div>
//               <div className="overlay-chat-messages">
//                 {chatMessages.map((m, idx) => {
//                   const isSelf = m.fromId === this.state.userData?._id;
//                   return (
//                     <div key={idx} className={`overlay-chat-message ${isSelf ? "msg-right" : "msg-left"}`}>
//                       <div className="msg-content">
//                         <strong className="msg-name">{m.fromName || (isSelf ? this.state.userData?.name : "User")}</strong>
//                         {m.isFile ? <a href={m.fileUrl} target="_blank" rel="noreferrer" download>{m.fileName}</a> : <span className="msg-name-text">{m.text}</span>}
//                         {m.uploading && <span style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>Uploading...</span>}
//                         {m.uploadError && <span style={{ fontSize: 12, color: "red", marginTop: 4 }}>{m.uploadError}</span>}
//                       </div>
//                     </div>
//                   );
//                 })}
//               </div>

//               <ChatInput onSend={msg => this.sendChatMessage(msg)} onSendFile={file => this.sendFile(file)} />
//             </div>
//           )}
//         </div>
//       </div>
//     );
//   }

//   handlePeerClose = (peerId) => {
//     if (this.peerConnections[peerId]) {
//       try { this.peerConnections[peerId].close(); } catch (e) { console.warn(e); }
//       delete this.peerConnections[peerId];
//     }
//     if (this.dataChannels[peerId]) {
//       try { this.dataChannels[peerId].close?.(); } catch (e) {}
//       delete this.dataChannels[peerId];
//     }
//     try {
//       const audioEl = document.getElementById(`audio-${peerId}`);
//       if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
//     } catch (e) {}

//     this.setState(prev => {
//       const newPeers = { ...prev.peers };
//       delete newPeers[peerId];
//       return { peers: newPeers, connectedPeers: prev.connectedPeers.filter(id => id !== peerId) };
//     });
//   };

//   preloadImages = async (urls = []) => {
//     await Promise.all(urls.map(url => new Promise(resolve => {
//       const img = new Image();
//       img.onload = () => resolve(img);
//       img.onerror = () => { console.warn("Failed to load:", url); resolve(img); };
//       img.src = url;
//     })));
//     console.log("Images preloaded");
//   };

//   handleKeyDown = (e) => { if (!e.key) return; this.keysPressed[e.key] = true; };
//   handleKeyUp = (e) => { if (!e.key) return; delete this.keysPressed[e.key]; };

//   startAnimationLoop = () => {
//     const loop = () => {
//       if (!this._isMounted) return;
//       this.updateAvatarPosition();
//       this.drawCanvas();
//       // proximity check happens inside updateAvatarPosition when movement occurs (keeps cheaper)
//       this.animationFrame = requestAnimationFrame(loop);
//     };
//     loop();
//   };

//   updateAvatarPosition = () => {
//     const speed = 2;
//     let { x, y } = this.state.myAvatar;
//     if (this.keysPressed["ArrowUp"]) y -= speed;
//     if (this.keysPressed["ArrowDown"]) y += speed;
//     if (this.keysPressed["ArrowLeft"]) x -= speed;
//     if (this.keysPressed["ArrowRight"]) x += speed;
//     const moved = (x !== this.state.myAvatar.x || y !== this.state.myAvatar.y);

//     if (!this.checkCollision(x, y) && moved) {
//       this.setState(prev => ({ myAvatar: { ...prev.myAvatar, x, y } }), () => {
//         if (this.socket && this.state.userData) this.socket.emit("move", { roomId: this.roomId, x, y });
//         const meId = this.state.userData?._id;
//         if (meId) {
//           this.setState(prev => ({ onlineUsers: prev.onlineUsers.map(u => u._id === meId ? ({ ...u, x, y, zone: this.computeZoneForUser({ ...u, x, y }) }) : u) }));
//         }
//         this.checkProximityAndManagePeers();
//       });
//     } else {
//       // no move — still keep UI consistent
//     }

//     const hasPeers = Object.keys(this.peerConnections).length > 0;
//     if (hasPeers !== this.state.showVideo) this.setState({ showVideo: hasPeers });
//   };

//   checkCollision = (x, y) => {
//     const avatar = this.state.myAvatar; if (!avatar) return false;
//     const avatarW = avatar.width || 32; const avatarH = avatar.height || 32;
//     const collisionLayer = mapData.layers?.find(l => l.name === "Collision");
//     const collisions = collisionLayer?.objects || [];
//     for (const obj of collisions) {
//       if (x < obj.x + obj.width && x + avatarW > obj.x && y < obj.y + obj.height && y + avatarH > obj.y) return true;
//     }
//     return false;
//   };

//   drawCanvas = () => {
//     const canvas = document.getElementById("mapCanvas");
//     if (!canvas || !this.mapImg || !this.spriteImg) return;
//     const ctx = canvas.getContext("2d"); if (!ctx) return;
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     const scaleX = canvas.width / this.mapImg.width;
//     const scaleY = canvas.height / this.mapImg.height;
//     ctx.drawImage(this.mapImg, 0, 0, canvas.width, canvas.height);

//     const collisions = mapData.layers?.find(l => l.name === "Collision")?.objects || [];
//     if (collisions.length) {
//       ctx.save(); ctx.strokeStyle = "red"; ctx.globalAlpha = 0.3;
//       collisions.forEach(obj => ctx.strokeRect(obj.x * scaleX, obj.y * scaleY, obj.width * scaleX, obj.height * scaleY));
//       ctx.restore();
//     }

//     const interactiveZones = this.interactiveZones || mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || [];
//     if (interactiveZones.length) {
//       ctx.save(); ctx.strokeStyle = "rgba(0,128,255,0.6)"; ctx.lineWidth = 2;
//       interactiveZones.forEach(z => {
//         ctx.strokeRect(z.x * scaleX, z.y * scaleY, z.width * scaleX, z.height * scaleY);
//         const label = (Array.isArray(z.properties) ? z.properties.find(p => p.name === 'name')?.value : null) || z.name || `id:${z.id}`;
//         ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.font = `${12 * scaleX}px Arial`; ctx.fillText(label, z.x * scaleX + 4, z.y * scaleY + 12);
//       });
//       ctx.restore();
//     }

//     const drawAvatar = (u) => {
//       if (!u) return;
//       try {
//         const sx = 0, sy = 0, sw = 128, sh = 128;
//         const dx = (u.x || 0) * scaleX;
//         const dy = (u.y || 0) * scaleY;
//         const dw = (u.width || 32) * scaleX;
//         const dh = (u.height || 32) * scaleY;
//         ctx.drawImage(this.spriteImg, sx, sy, sw, sh, dx, dy, dw, dh);
//         ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.fillText(u.name || "User", dx, dy - 6);
//       } catch (e) { console.warn("Avatar draw error:", e); }
//     };
//     drawAvatar(this.state.myAvatar);
//     (this.state.onlineUsers || []).forEach(drawAvatar);
//   };

//   // PROXIMITY: determines who is in the same zone and manages peers
//   checkProximityAndManagePeers = () => {
//     const me = this.state.myAvatar;
//     const online = this.state.onlineUsers || [];

//     if (!me || me.x == null || me.y == null) {
//       if (this.state.showProximityUI || this.state.showSidebar) this.setState({ showProximityUI: false, showSidebar: false, activeOverlayPeers: [] });
//       if (this.currentZone) { this.currentZone = null; try { this.sendLeaveZone(); } catch(e){} }
//       this.cleanupWebRTC();
//       return;
//     }

//     const myId = this.state.userData?._id || this.state.myAvatar?._id || null;
//     const myCenterX = me.x + ((me.width || 32) / 2);
//     const myCenterY = me.y + ((me.height || 32) / 2);
//     const myZone = this.getZoneForPosition(myCenterX, myCenterY);

//     if (this.currentZone !== myZone) {
//       if (this.currentZone != null) { try { this.sendLeaveZone(); } catch (e) {} }
//       this.currentZone = myZone;
//       if (myZone != null) { try { this.sendEnterZone(myZone); } catch (e) {} }
//     }

//     if (!myZone) {
//       Object.keys(this.peerConnections).forEach(pid => this.handlePeerClose(pid));
//       this.setState({ showProximityUI: false, showSidebar: false, activeOverlayPeers: [] });
//       return;
//     }

//     const peersInSameZone = online.filter(u => {
//       if (!u || !u._id) return false;
//       if (myId && u._id === myId) return false;
//       const ux = (typeof u.x === "number" ? u.x : 0) + ((u.width || 32) / 2);
//       const uy = (typeof u.y === "number" ? u.y : 0) + ((u.height || 32) / 2);
//       const zoneForU = this.getZoneForPosition(ux, uy);
//       return zoneForU === myZone;
//     }).map(u => u._id);

//     const peersInSameZoneSet = new Set(peersInSameZone);
//     Object.keys(this.peerConnections).forEach(pid => { if (!peersInSameZoneSet.has(pid)) this.handlePeerClose(pid); });

//     const wantMedia = this.state.isAudioOn || this.state.isVideoOn;
//     if (wantMedia) {
//       peersInSameZone.forEach(pid => {
//         if (!this.peerConnections[pid]) {
//           this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" }).catch(err => console.warn("initiateConnection err", err));
//         }
//       });
//     }

//     const shouldShowUI = peersInSameZone.length > 0;
//     this.setState({ showProximityUI: shouldShowUI, showSidebar: shouldShowUI, activeOverlayPeers: peersInSameZone, connectedPeers: Object.keys(this.peerConnections) });
//   };

//   sendChatMessage = (message) => {
//     if (!message.trim() || !this.socket) return;

//     // block chat outside zone
//     if (!this.currentZone) {
//       console.warn("Cannot send chat: not inside any zone");
//       return;
//     }

//     // send to server (server will echo/forward to zone)
//     this.socket.emit("chat", { message: message.trim() });
//     // optimistic append so user sees their message
//     this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: this.state.userData?._id || "me", fromName: this.state.userData?.name || "Me", text: message.trim(), ts: Date.now() }] }));
//   };
// }

// // ChatInput component (unchanged)
// class ChatInput extends Component {
//   state = { text: "" };
//   fileRef = React.createRef();

//   onChange = (e) => this.setState({ text: e.target.value });
//   onSend = () => {
//     const { text } = this.state;
//     if (!text.trim()) return;
//     this.props.onSend(text.trim());
//     this.setState({ text: "" });
//   };
//   onKey = (e) => { if (e.key === "Enter") this.onSend(); };

//   onFileChange = (e) => {
//     const file = e.target.files && e.target.files[0];
//     if (!file) return;
//     if (this.props.onSendFile) this.props.onSendFile(file);
//     e.target.value = "";
//   };

//   render() {
//     return (
//       <div className="chat-input-bar">
//         <label className="chat-icon">
//           <IoAttach />
//           <input type="file" ref={this.fileRef} onChange={this.onFileChange} style={{ display: "none" }} />
//         </label>

//         <input value={this.state.text} onChange={this.onChange} onKeyDown={this.onKey} placeholder="Enter your message" className="chat-input" />

//         <div className="chat-icon" onClick={this.onSend}><IoSend /></div>
//       </div>
//     );
//   }
// }

// export default Meeting;



// src/components/Meeting/index.js
import React, { Component } from "react";
import io from "socket.io-client";
import "./index.css";
import { FaHome, FaVideo } from "react-icons/fa";
import { IoMdMic } from "react-icons/io";
import { FiMessageCircle } from "react-icons/fi";
import { MdDirectionsWalk, MdOutlineKeyboardArrowLeft } from "react-icons/md";
import { IoSearch, IoAttach, IoSend } from "react-icons/io5";
import { FiX } from "react-icons/fi";
import map_img from "./assets/tiles/tileset.png";
import avatarSprite from "./assets/avatars/avatars_sprites.png";
import mapData from "./assets/tiles/Communication___room.json";
import Cookies from "js-cookie";

const ICE_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const INTERACTABLES_LAYER_NAME = "Interactables";
const FILE_CHUNK_SIZE = 64 * 1024; // 64KB

class Meeting extends Component {
  // Non-state storages for peers and animations
  peerConnections = {}; // peerId -> RTCPeerConnection
  dataChannels = {}; // peerId -> RTCDataChannel
  incomingFiles = {}; // fileId -> { meta, receivedSize, chunks: [] }
  animationFrame = null;
  keysPressed = {};

  // Preloaded images
  mapImg = new Image();
  spriteImg = new Image();

  _fileSharedListenerAttached = false;

  state = {
    onlineUsers: [],
    offlineUsers: [],
    userData: null,
    localStream: null,
    myAvatar: { _id: null, name: "Me", x: 100, y: 200, width: 50, height: 50, frame: 0, dir: 0 },
    isAudioOn: false,
    isVideoOn: false,
    peers: {},
    connectedPeers: [],
    showChatPanel: false,
    chatMessages: [],
    showProximityUI: false,
    activeOverlayPeers: [],
    showSidebar: false,
    activeTab: "users",
    isSidebarCollapsed: false,
    showVideo: false
  };

  allUsers = [];
  roomId = "global";
  currentZone = null; // client-side current zone

  constructor(props) {
    super(props);
    this.prevActiveStreamsCount = 0;
    this._isMounted = false;
  }

  // central file-shared handler
  handleFileShared = (payload) => {
    try {
      if (!payload) return;
      const myId = this.state.userData?._id;

      // avoid duplicate self-broadcasts
      if (payload.fromId && myId && payload.fromId === myId) {
        console.debug("Ignoring duplicate file-shared broadcast for sender");
        return;
      }

      const fileUrl = payload.fileUrl
        ? payload.fileUrl.startsWith("http")
          ? payload.fileUrl
          : `${window.location.origin.replace(/:3000$/, ":5000")}${payload.fileUrl}`
        : `${window.location.origin.replace(/:3000$/, ":5000")}/api/files/${payload.fileId}`;

      const fromName = payload.fromName || payload.fromId || "User";

      this.setState(prev => ({
        chatMessages: [...prev.chatMessages, {
          fromId: payload.fromId,
          fromName,
          isFile: true,
          fileName: payload.fileName,
          fileUrl,
          fileId: payload.fileId,
          ts: Date.now()
        }]
      }));
    } catch (err) {
      console.warn("handleFileShared error:", err);
    }
  }

  // returns the zone name (string) for the provided position (x,y) or null if none
  getZoneForPosition = (x, y) => {
    const zones = this.interactiveZones || (mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || []);
    if (!zones || !zones.length) return null;

    for (const zone of zones) {
      const zx = zone.x || 0;
      const zy = zone.y || 0;
      const zw = zone.width || 0;
      const zh = zone.height || 0;
      if (x >= zx && x <= zx + zw && y >= zy && y <= zy + zh) {
        let zoneName = null;
        if (Array.isArray(zone.properties)) {
          const p = zone.properties.find(pr => pr.name === "name" || pr.name === "zoneName" || pr.name === "label");
          if (p) zoneName = p.value;
        }
        return zoneName || zone.name || `zone-${zone.id}`;
      }
    }
    return null;
  };

  // compute zone for a user record (by center)
  computeZoneForUser = (u) => {
    try {
      const ux = (typeof u.x === "number" ? u.x : 0) + ((u.width || 32) / 2);
      const uy = (typeof u.y === "number" ? u.y : 0) + ((u.height || 32) / 2);
      return this.getZoneForPosition(ux, uy);
    } catch (e) {
      return null;
    }
  }

  normalizeUsersList = (raw) => {
    let arr = [];
    if (Array.isArray(raw)) {
      arr = raw.map(u => ({
        _id: u.userId || u._id || u.id,
        x: typeof u.x === "number" ? u.x : 100,
        y: typeof u.y === "number" ? u.y : 100,
        width: u.width || this.state.myAvatar.width,
        height: u.height || this.state.myAvatar.height,
        name: u.username || u.name || "User",
        avatar: u.avatar || null,
        zone: null
      }));
    } else if (raw && typeof raw === "object") {
      arr = Object.entries(raw).map(([uid, u]) => ({
        _id: uid,
        x: (typeof u.x === "number") ? u.x : 100,
        y: (typeof u.y === "number") ? u.y : 100,
        width: u.width || this.state.myAvatar.width,
        height: u.height || this.state.myAvatar.height,
        name: u.username || u.name || "User",
        avatar: u.avatar || null,
        zone: null
      }));
    }

    // dedupe + exclude local user
    const map = new Map();
    const localId = this.state?.userData?._id;
    arr.forEach(u => {
      if (!u || !u._id) return;
      if (u._id === localId) return;
      if (!map.has(u._id)) map.set(u._id, u);
      else {
        const existing = map.get(u._id);
        map.set(u._id, { ...existing, ...u });
      }
    });

    // compute zone client-side for each user (important)
    const result = Array.from(map.values()).map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
    return result;
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
    this.interactiveZones = mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || [];
    console.log("[Map] Interactables zones loaded:", this.interactiveZones.length);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    await this.initUserAndSocket();
    if (!this.socket) return;

    const currentUser = this.state.userData;
    if (currentUser && currentUser._id) {
      this.setState(prev => ({
        myAvatar: {
          ...prev.myAvatar,
          _id: currentUser._id,
          name: currentUser.name,
          width: prev.myAvatar.width || 50,
          height: prev.myAvatar.height || 50,
          avatar: currentUser.avatar || null
        }
      }));
    }

    this.startAnimationLoop();

    // central file-shared listener
    if (!this._fileSharedListenerAttached) {
      this.socket.on("file-shared", (payload) => {
        this.handleFileShared(payload);
      });
      this._fileSharedListenerAttached = true;
    }

    // video-toggle handler (UI-only)
    this.socket.on("video-toggle", ({ userId, enabled }) => {
      const peer = this.state.peers[userId];
      if (!peer) return;
      this.setState(prev => ({
        peers: {
          ...prev.peers,
          [userId]: { ...peer, isVideoOn: enabled }
        }
      }));
      const vidEl = document.getElementById(`video-${userId}`);
      if (vidEl) vidEl.srcObject = enabled ? peer.stream : null;
    });
  };

  componentWillUnmount() {
    this._isMounted = false;
    if (this.socket) {
      try { this.socket.disconnect(); } catch(e) {}
      this.socket = null;
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

    // stop local stream tracks
    if (this.state.localStream) {
      try {
        this.state.localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
      } catch (e) {}
    }

    // close peers
    Object.keys(this.peerConnections).forEach(pid => {
      try { this.peerConnections[pid].close(); } catch(e) {}
      delete this.peerConnections[pid];
    });

    // reset state
    try {
      // avoid setState on unmounted but reset internal references
      this.peerConnections = {};
      this.dataChannels = {};
    } catch (e) {}
  }

  // ---------------------
  // Socket and user init
  // ---------------------
  initUserAndSocket = async () => {
    try {
      const profileRes = await fetch("http://localhost:5000/api/auth/me", { credentials: "include" });
      if (!profileRes.ok) throw new Error("Not logged in");
      const userData = await profileRes.json();
      if (!this._isMounted) return;

      this.setState(prev => ({
        userData,
        myAvatar: {
          ...prev.myAvatar,
          _id: userData._id,
          name: userData.name,
          width: prev.myAvatar.width,
          height: prev.myAvatar.height,
          avatar: userData.avatar || null
        }
      }));

      const usersRes = await fetch("http://localhost:5000/api/users", { credentials: "include" });
      const allUsers = (await usersRes.json()) || [];
      this.allUsers = allUsers;
      const offlineUsers = allUsers.filter(u => u._id !== userData._id);
      if (this._isMounted) this.setState({ offlineUsers });

      // Socket: include cookie or token if applicable
      this.socket = io("http://localhost:5000", {
        withCredentials: true,
        transports: ["websocket"],
        auth: { token: Cookies.get("jwt_token") } // optional, your server may read cookie directly
      });

      if (this.socket && !this._fileSharedListenerAttached) {
        this.socket.on("file-shared", (payload) => this.handleFileShared(payload));
        this._fileSharedListenerAttached = true;
      }

      this.socket.on("connect", () => {
        this.socket.emit("joinRoom", { roomId: this.roomId, avatar: this.state.myAvatar });
        console.log("[Socket] Connected and joined room:", this.roomId);
      });

      // currentPositions -> normalize -> compute zones client-side
      this.socket.on("currentPositions", (usersObj) => {
        let normalized = this.normalizeUsersList(usersObj || {});
        // include self
        const me = this.makeMeEntry();
        if (me) normalized = Array.from(new Map([[me._id, me], ...normalized.map(u => [u._id, u])]).values());
        // recompute zones (ensure up-to-date)
        normalized = normalized.map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
        if (this._isMounted) {
          this.setState({ onlineUsers: normalized }, () => {
            this.updateOfflineUsers(normalized);
            this.checkProximityAndManagePeers();
            console.log("[Socket] currentPositions -> onlineUsers set:", normalized);
          });
        }
      });

      this.socket.on("onlineUsers", (usersArr) => {
        let normalized = this.normalizeUsersList(usersArr || []);
        const me = this.makeMeEntry();
        if (me) normalized = Array.from(new Map([[me._id, me], ...normalized.map(u => [u._id, u])]).values());
        normalized = normalized.map(u => ({ ...u, zone: this.computeZoneForUser(u) }));
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
          stream: null
        };
        // compute zone
        newUser.zone = this.computeZoneForUser(newUser);
        this.setState(prev => {
          if (prev.onlineUsers.find(u => u._id === uid)) return prev;
          return { onlineUsers: [...prev.onlineUsers, newUser] };
        }, () => {
          this.updateOfflineUsers(this.state.onlineUsers);
          this.checkProximityAndManagePeers();
        });
        console.log("[Socket] User joined:", uid);
      });

      this.socket.on("userMoved", (payload) => {
        const id = payload.userId || payload._id || payload.id;
        const x = payload.x;
        const y = payload.y;
        if (!id) return;
        this.setState(prev => {
          const updated = prev.onlineUsers.map(u => u._id === id ? ({ ...u, x, y, zone: this.computeZoneForUser({ ...u, x, y }) }) : u);
          return { onlineUsers: updated };
        }, () => {
          this.checkProximityAndManagePeers();
        });
      });

      this.socket.on("userLeft", (payload) => {
        const id = payload.id || payload.userId || payload._id;
        if (!id) return;

        // Remove audio element if any
        try {
          const audioEl = document.getElementById(`audio-${id}`);
          if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
        } catch (e) {}

        this.setState(prev => ({
          onlineUsers: prev.onlineUsers.filter(u => u._id !== id),
          peers: Object.fromEntries(Object.entries(prev.peers).filter(([pid]) => pid !== id))
        }), () => {
          this.checkProximityAndManagePeers();
        });

        if (this.peerConnections[id]) {
          try { this.peerConnections[id].close(); } catch (e) {}
          delete this.peerConnections[id];
        }
        if (this.dataChannels[id]) {
          try { this.dataChannels[id].close?.(); } catch (e) {}
          delete this.dataChannels[id];
        }
        console.log("[Socket] User left:", id);
      });

      // zoneUsers (server-provided list of users in our zone) -> we ensure p2p only for these ids
      this.socket.on("zoneUsers", (zoneMembers) => {
        try {
          console.debug("zoneUsers payload:", zoneMembers);
          const ids = (zoneMembers || []).map(m => m.userId || m._id || m.id).filter(Boolean);
          // close peer connections not in ids
          Object.keys(this.peerConnections).forEach(pid => { if (!ids.includes(pid)) this.handlePeerClose(pid); });
          // ensure we have peerConnections for everyone in ids (except self)
          ids.forEach(uid => {
            if (uid === this.state.userData?._id) return;
            if (!this.peerConnections[uid]) {
              this.initiateConnection(uid).catch(err => console.warn("zoneUsers -> initiateConnection err", err));
            }
          });
          this.setState(prev => ({ activeOverlayPeers: ids, connectedPeers: Object.keys(this.peerConnections) }));
        } catch (err) { console.error("zoneUsers handler error:", err); }
      });

      // CHAT: server sends { from, fromName, message, zone }
      // Client accepts server messages (server already filtered by zone)
this.socket.on("chat", ({ from, message, zone }) => {
  try {
    const myId = this.state.userData?._id;

    // Prevent sender from receiving duplicate message
    if (from === myId) {
      console.debug("Ignoring echo chat message from server");
      return;
    }

    const fromName =
      this.state.onlineUsers.find(u => u._id === from)?.name ||
      "User";

    this.setState(prev => ({
      chatMessages: [
        ...prev.chatMessages,
        { fromId: from, fromName, text: message, ts: Date.now() }
      ]
    }));
  } catch (err) {
    console.error("chat handler error:", err);
  }
});


      // ---------------------------
      // SIGNALING: handle incoming signals (offer/answer/candidate)
      // ---------------------------
      this.socket.on("signal", async (msg) => {
        try {
          const from = msg.from || msg.userId || msg.id;
          const type = msg.type || msg.signalType;
          const data = msg.data;
          if (!from || !type) return;

          // Optionally: you can validate that 'from' is a user in same zone here.
          if (type === "offer") {
            await this.handleOffer(from, data);
          } else if (type === "answer") {
            await this.handleAnswer(from, data);
          } else if (type === "candidate" || type === "ice-candidate") {
            await this.handleCandidate(from, data);
          } else {
            console.debug("Unknown signal type:", type);
          }
        } catch (err) { console.error("signal handler error:", err); }
      });

      // file-broadcast fallback
      this.socket.on("file-broadcast", ({ fromId, fromName, filename, mime, buffer }) => {
        try {
          const blob = new Blob([buffer], { type: mime || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId, fromName, isFile: true, fileName: filename, fileUrl: url, ts: Date.now() }] }));
        } catch (err) { console.warn("file-broadcast handle error:", err); }
      });

      console.log("[Init] Socket listeners attached.");
    } catch (err) {
      console.error("initUserAndSocket error:", err);
    }
  };

  // helper: emit enterZone with userId + zone
  sendEnterZone = (zone) => {
    try {
      const myId = this.state.userData?._id;
      if (!this.socket || !myId || !zone) return;
      this.socket.emit("enterZone", { userId: myId, zone });
    } catch (err) { console.warn("sendEnterZone error:", err); }
  };

  sendLeaveZone = () => {
    try { if (!this.socket) return; const myId = this.state.userData?._id; this.socket.emit("leaveZone", { userId: myId }); } catch (err) { console.warn("sendLeaveZone error:", err); }
  };

  makeMeEntry = () => {
    const id = this.state?.userData?._id;
    if (!id) return null;
    const avatar = this.state.userData?.avatar || this.state.myAvatar?.avatar || null;
    return {
      _id: id,
      x: (typeof this.state.myAvatar?.x === "number") ? this.state.myAvatar.x : (this.state.myAvatar?.x || 100),
      y: (typeof this.state.myAvatar?.y === "number") ? this.state.myAvatar.y : (this.state.myAvatar?.y || 100),
      width: this.state.myAvatar?.width || 50,
      height: this.state.myAvatar?.height || 50,
      name: this.state.userData?.name || this.state.myAvatar?.name || "Me",
      avatar
    };
  };

  updateOfflineUsers = (currentOnline = []) => {
    if (!this._isMounted) return;
    const onlineIds = currentOnline.map(u => u._id);
    const updatedOffline = (this.allUsers || []).filter(u => u._id !== this.state.userData?._id && !onlineIds.includes(u._id));
    this.setState({ offlineUsers: updatedOffline });
  };

  // --------------------------
  // WebRTC: Create PeerConnection
  // --------------------------
  // createPeerConnection = (peerId, userInfo = {}) => {
  //   if (this.peerConnections[peerId]) return this.peerConnections[peerId];

  //   const pc = new RTCPeerConnection(ICE_CONFIG);
  //   pc._makingOffer = false;

  //   // Determine polite role deterministically:
  //   // if myId > peerId (string comparison) make me polite (I will yield on collisions).
  //   // This ensures both sides compute same polite role.
  //   const myId = this.state.userData?._id || "";
  //   pc._polite = String(myId) > String(peerId);
  //   pc._ignoreOffer = false;

  //   pc.ondatachannel = (event) => {
  //     const dc = event.channel;
  //     this.setupDataChannel(peerId, dc);
  //   };

  //   pc.ontrack = (event) => {
  //     const remoteStream = event.streams[0];
  //     // update peers state with stream
  //     this.setState(prev => ({
  //       peers: {
  //         ...prev.peers,
  //         [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: remoteStream, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" }
  //       }
  //     }), () => {
  //       // attach stream to <video> if exists, otherwise create hidden audio element
  //       const videoEl = document.getElementById(`video-${peerId}`);
  //       if (videoEl) {
  //         if (videoEl.srcObject !== remoteStream) videoEl.srcObject = remoteStream;
  //         videoEl.muted = false;
  //         videoEl.play().catch(err => console.warn("videoEl.play() blocked:", err));
  //       } else {
  //         let audioEl = document.getElementById(`audio-${peerId}`);
  //         if (!audioEl) {
  //           audioEl = document.createElement("audio");
  //           audioEl.id = `audio-${peerId}`;
  //           audioEl.autoplay = true;
  //           audioEl.playsInline = true;
  //           audioEl.style.display = "none";
  //           document.body.appendChild(audioEl);
  //         }
  //         if (audioEl.srcObject !== remoteStream) audioEl.srcObject = remoteStream;
  //         audioEl.muted = false;
  //         audioEl.play().catch(err => console.warn("audioEl.play() blocked:", err));
  //       }
  //     });
  //   };

  //   pc.onicecandidate = (event) => {
  //     if (event.candidate) {
  //       try {
  //         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "candidate", data: event.candidate });
  //       } catch (e) { console.warn("socket missing when sending candidate", e); }
  //     }
  //   };

  //   pc.onconnectionstatechange = () => {
  //     const state = pc.connectionState;
  //     if (state === "disconnected" || state === "failed" || state === "closed") {
  //       if (this.peerConnections[peerId]) {
  //         try { this.peerConnections[peerId].close(); } catch (e) {}
  //         delete this.peerConnections[peerId];
  //       }
  //       if (this.dataChannels[peerId]) {
  //         try { this.dataChannels[peerId].close?.(); } catch (e) {}
  //         delete this.dataChannels[peerId];
  //       }
  //       try {
  //         const audioEl = document.getElementById(`audio-${peerId}`);
  //         if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
  //       } catch (e) {}

  //       this.setState(prev => {
  //         const newPeers = { ...prev.peers }; delete newPeers[peerId];
  //         return { peers: newPeers, connectedPeers: Object.keys(this.peerConnections) };
  //       });
  //     }
  //   };

  //   pc.oniceconnectionstatechange = () => {
  //     console.log("[pc.oniceconnectionstatechange]", peerId, pc.iceConnectionState);
  //   };

  //   pc.onnegotiationneeded = async () => {
  //     // IMPORTANT: only create an offer if signalingState is stable to avoid collisions
  //     try {
  //       if (pc._makingOffer) return;
  //       if (pc.signalingState !== "stable") {
  //         // skip negotiation if not stable
  //         console.debug("[onnegotiationneeded] skipping because signalingState not stable:", pc.signalingState);
  //         return;
  //       }
  //       pc._makingOffer = true;
  //       const offer = await pc.createOffer();
  //       await pc.setLocalDescription(offer);
  //       this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
  //     } catch (err) {
  //       console.warn("onnegotiationneeded error for", peerId, err);
  //     } finally {
  //       pc._makingOffer = false;
  //     }
  //   };

  //   this.peerConnections[peerId] = pc;
  //   this.setState(prev => ({ peers: { ...prev.peers, [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: prev.peers[peerId]?.stream || null, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" } } }));
  //   return pc;
  // };
  createPeerConnection = (peerId, userInfo = {}) => {
  if (this.peerConnections[peerId]) return this.peerConnections[peerId];

  const pc = new RTCPeerConnection(ICE_CONFIG);
  pc._makingOffer = false;
  pc._polite = String(this.state.userData?._id || "") > String(peerId); // deterministic polite role
  pc._ignoreOffer = false;
  pc._pendingCandidates = []; // queue candidates arriving early

  // Data channel created by remote -> attach handler
  pc.ondatachannel = (ev) => this.setupDataChannel(peerId, ev.channel);

  // Remote media tracks -> update state + attach to elements
  pc.ontrack = (ev) => {
    const remoteStream = ev.streams && ev.streams[0];
    this.setState(prev => ({
      peers: {
        ...prev.peers,
        [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: remoteStream, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" }
      }
    }), () => {
      const videoEl = document.getElementById(`video-${peerId}`);
      if (videoEl && remoteStream) {
        if (videoEl.srcObject !== remoteStream) videoEl.srcObject = remoteStream;
        videoEl.muted = false;
        videoEl.play().catch(() => {});
      } else if (remoteStream) {
        // fallback: create hidden audio element for audio-only peers
        let audioEl = document.getElementById(`audio-${peerId}`);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.id = `audio-${peerId}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.style.display = "none";
          document.body.appendChild(audioEl);
        }
        if (audioEl.srcObject !== remoteStream) audioEl.srcObject = remoteStream;
        audioEl.muted = false;
        audioEl.play().catch(() => {});
      }
    });
  };

  // Send ICE candidates to signaling server
  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      try {
        this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "candidate", data: ev.candidate });
      } catch (e) { console.warn("socket missing when sending candidate", e); }
    }
  };

  // Connection state handling and cleanup
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    console.debug("[pc.connstate]", peerId, s);
    if (s === "disconnected" || s === "failed" || s === "closed") {
      try { pc.close(); } catch(e) {}
      delete this.peerConnections[peerId];
      if (this.dataChannels[peerId]) { try { this.dataChannels[peerId].close?.(); } catch(e){} delete this.dataChannels[peerId]; }
      try { const audioEl = document.getElementById(`audio-${peerId}`); if (audioEl) { audioEl.srcObject = null; audioEl.remove(); } } catch(e){}
      this.setState(prev => {
        const newPeers = { ...prev.peers }; delete newPeers[peerId];
        return { peers: newPeers, connectedPeers: Object.keys(this.peerConnections) };
      });
    }
  };

  pc.oniceconnectionstatechange = () => console.log("[pc.oniceconnectionstatechange]", peerId, pc.iceConnectionState);

  // Only create offers when signalingState is stable (avoid collisions)
  pc.onnegotiationneeded = async () => {
    try {
      if (pc._makingOffer) return;
      if (pc.signalingState !== "stable") return;
      pc._makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
    } catch (err) {
      console.warn("onnegotiationneeded error for", peerId, err);
    } finally {
      pc._makingOffer = false;
    }
  };

  this.peerConnections[peerId] = pc;
  this.setState(prev => ({ peers: { ...prev.peers, [peerId]: { ...(prev.peers[peerId] || {}), pc, stream: prev.peers[peerId]?.stream || null, name: userInfo.username || prev.peers[peerId]?.name || "Unknown" } } }));
  return pc;
};

  // setupDataChannel = (peerId, dc) => {
  //   this.dataChannels[peerId] = dc;
  //   dc.binaryType = "arraybuffer";
  //   dc.onopen = () => console.log(`[DataChannel] open for ${peerId}`);
  //   dc.onclose = () => { console.log(`[DataChannel] closed for ${peerId}`); delete this.dataChannels[peerId]; };
  //   dc.onerror = (e) => console.warn("[DataChannel] error", e);

  //   dc.onmessage = (ev) => {
  //     try {
  //       if (typeof ev.data === "string") {
  //         const msg = JSON.parse(ev.data);
  //         if (msg && msg.type === "file-meta") {
  //           this.incomingFiles[msg.fileId] = { meta: msg, receivedSize: 0, chunks: [] };
  //         }
  //       } else if (ev.data instanceof ArrayBuffer) {
  //         const entries = Object.entries(this.incomingFiles);
  //         if (entries.length === 0) return;
  //         let targetFileId = null;
  //         for (const [fid, rec] of entries) {
  //           if (rec.receivedSize < rec.meta.size) { targetFileId = fid; break; }
  //         }
  //         if (!targetFileId) return;
  //         const rec = this.incomingFiles[targetFileId];
  //         rec.chunks.push(ev.data);
  //         rec.receivedSize += ev.data.byteLength;
  //         if (rec.receivedSize >= rec.meta.size) {
  //           const blob = new Blob(rec.chunks, { type: rec.meta.mime || "application/octet-stream" });
  //           const url = URL.createObjectURL(blob);
  //           const fromName = this.state.onlineUsers.find(u => u._id === peerId)?.name || peerId;
  //           this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: peerId, fromName, isFile: true, fileName: rec.meta.filename, fileUrl: url, ts: Date.now() }] }));
  //           delete this.incomingFiles[targetFileId];
  //           console.log("[DataChannel] file received complete", rec.meta.filename);
  //         }
  //       }
  //     } catch (err) { console.error("DataChannel onmessage error:", err); }
  //   };
  // };

  // helper: polite renegotiate for an existing peer after adding tracks
  
  
/**
 * Setup datachannel (file transfer)
 */
setupDataChannel = (peerId, dc) => {
  this.dataChannels[peerId] = dc;
  dc.binaryType = "arraybuffer";
  dc.onopen = () => console.log(`[DataChannel] open for ${peerId}`);
  dc.onclose = () => { console.log(`[DataChannel] closed for ${peerId}`); delete this.dataChannels[peerId]; };
  dc.onerror = (e) => console.warn("[DataChannel] error", e);

  dc.onmessage = (ev) => {
    try {
      if (typeof ev.data === "string") {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "file-meta") this.incomingFiles[msg.fileId] = { meta: msg, receivedSize: 0, chunks: [] };
      } else if (ev.data instanceof ArrayBuffer) {
        // assemble file chunks (same logic as your code)
        const entries = Object.entries(this.incomingFiles);
        if (!entries.length) return;
        let targetFileId = null;
        for (const [fid, rec] of entries) { if (rec.receivedSize < rec.meta.size) { targetFileId = fid; break; } }
        if (!targetFileId) return;
        const rec = this.incomingFiles[targetFileId];
        rec.chunks.push(ev.data);
        rec.receivedSize += ev.data.byteLength;
        if (rec.receivedSize >= rec.meta.size) {
          const blob = new Blob(rec.chunks, { type: rec.meta.mime || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const fromName = this.state.onlineUsers.find(u => u._id === peerId)?.name || peerId;
          this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: peerId, fromName, isFile: true, fileName: rec.meta.filename, fileUrl: url, ts: Date.now() }] }));
          delete this.incomingFiles[targetFileId];
          console.log("[DataChannel] file received complete", rec.meta.filename);
        }
      }
    } catch (err) { console.error("DataChannel onmessage error:", err); }
  };
};


  // renegotiatePeer = async (pc, peerId) => {
  //   if (!pc || !this.socket) return;
  //   try {
  //     // only try if signaling state is stable to avoid collision
  //     if (pc.signalingState && pc.signalingState !== "stable") return;
  //     if (pc._makingOffer) return;
  //     pc._makingOffer = true;
  //     const offer = await pc.createOffer();
  //     await pc.setLocalDescription(offer);
  //     this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
  //   } catch (err) {
  //     console.warn("renegotiatePeer error for", peerId, err);
  //   } finally {
  //     try { pc._makingOffer = false; } catch (e) {}
  //   }
  // };

  // Initiate (create offer)
  
  renegotiatePeer = async (pc, peerId) => {
  if (!pc || !this.socket) return;
  try {
    if (pc.signalingState && pc.signalingState !== "stable") return;
    if (pc._makingOffer) return;
    pc._makingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
  } catch (err) {
    console.warn("renegotiatePeer error for", peerId, err);
  } finally {
    try { pc._makingOffer = false; } catch (e) {}
  }
};
  
  // initiateConnection = async (peerId, userInfo = {}) => {
  //   const pc = this.createPeerConnection(peerId, userInfo);
  //   try {
  //     const localStream = this.state.localStream;
  //     if (localStream) {
  //       localStream.getTracks().forEach(track => {
  //         if (!pc.getSenders().some(s => s.track === track)) {
  //           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack err", e); }
  //         }
  //       });
  //     }

  //     try {
  //       if (!this.dataChannels[peerId]) {
  //         const dc = pc.createDataChannel("file");
  //         this.setupDataChannel(peerId, dc);
  //       }
  //     } catch (e) {
  //       console.warn("createDataChannel err (may be fine if remote created one):", e);
  //     }

  //     if (typeof pc._makingOffer === "undefined") pc._makingOffer = false;

  //     // create an offer only if signalingState is stable (avoid collisions)
  //     if (!pc._makingOffer && pc.signalingState === "stable") {
  //       pc._makingOffer = true;
  //       try {
  //         const offer = await pc.createOffer();
  //         await pc.setLocalDescription(offer);
  //         this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
  //       } finally {
  //         pc._makingOffer = false;
  //       }
  //     } else {
  //       console.debug("Skipped initiating offer because pc not stable or already makingOffer", peerId, pc.signalingState);
  //     }

  //     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
  //   } catch (err) {
  //     console.error("[WebRTC] Failed to initiate connection:", err);
  //     try { if (pc) pc._makingOffer = false; } catch(e){}
  //   }
  // };

  // SAFE helpers to setRemoteDescription / addIceCandidate with fallbacks
  
  /**
 * Initiate connection (create data channel + add local tracks + create offer if stable)
 */
initiateConnection = async (peerId, userInfo = {}) => {
  const pc = this.createPeerConnection(peerId, userInfo);
  try {
    const localStream = this.state.localStream;
    if (localStream) {
      localStream.getTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track === track)) {
          try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack err", e); }
        }
      });
    }

    try {
      if (!this.dataChannels[peerId]) {
        const dc = pc.createDataChannel("file");
        this.setupDataChannel(peerId, dc);
      }
    } catch (e) { console.warn("createDataChannel err:", e); }

    if (typeof pc._makingOffer === "undefined") pc._makingOffer = false;

    if (!pc._makingOffer && pc.signalingState === "stable") {
      pc._makingOffer = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.socket.emit("signal", { from: this.state.myAvatar._id, to: peerId, type: "offer", data: offer });
      } finally { pc._makingOffer = false; }
    } else {
      console.debug("Skip creating offer (not stable or already makingOffer)", peerId, pc.signalingState);
    }

    this.setState({ connectedPeers: Object.keys(this.peerConnections) });
  } catch (err) {
    console.error("[WebRTC] initiateConnection failed:", err);
    try { if (pc) pc._makingOffer = false; } catch(e){}
  }
};


  
  // safeSetRemoteDescription = async (pc, desc) => {
  //   if (!pc) return;
  //   try {
  //     await pc.setRemoteDescription(desc);
  //   } catch (err) {
  //     try {
  //       // try using constructors if plain object fails
  //       await pc.setRemoteDescription(new RTCSessionDescription(desc));
  //     } catch (e2) {
  //       throw e2;
  //     }
  //   }
  // };

  // safeAddIceCandidate = async (pc, cand) => {
  //   if (!pc) return;
  //   try {
  //     await pc.addIceCandidate(cand);
  //   } catch (err) {
  //     try {
  //       await pc.addIceCandidate(new RTCIceCandidate(cand));
  //     } catch (e2) {
  //       // non-fatal: candidate may be malformed or arrive early; log and continue
  //       console.warn("safeAddIceCandidate second attempt failed:", e2);
  //     }
  //   }
  // };

  // // HANDLE OFFER (perfect negotiation)
  // handleOffer = async (fromId, offer) => {
  //   try {
  //     const pc = this.createPeerConnection(fromId);
  //     // collision detection
  //     const makingOffer = !!pc._makingOffer;
  //     const notStable = pc.signalingState !== "stable";
  //     const offerCollision = makingOffer || notStable;

  //     // If we are impolite and there is an offer collision -> ignore the offer
  //     if (!pc._polite && offerCollision) {
  //       console.warn("[handleOffer] Ignoring offer due to collision (impolite)", fromId, { signalingState: pc.signalingState, _makingOffer: pc._makingOffer });
  //       return;
  //     }

  //     if (offerCollision) {
  //       // polite peer: perform rollback before applying remote offer
  //       try {
  //         await pc.setLocalDescription({ type: "rollback" });
  //       } catch (rbErr) {
  //         console.warn("rollback failed:", rbErr);
  //       }
  //     }

  //     // Accept the offer (use safe helper)
  //     await this.safeSetRemoteDescription(pc, offer);

  //     // ensure local tracks are added (if we want to send media)
  //     if (this.state.isVideoOn || this.state.isAudioOn) {
  //       if (!this.state.localStream) await this.ensureLocalStream();
  //       const localStream = this.state.localStream;
  //       localStream.getTracks().forEach(track => {
  //         if (!pc.getSenders().some(s => s.track === track)) {
  //           try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack while answering err", e); }
  //         }
  //       });
  //     }

  //     const answer = await pc.createAnswer();
  //     await pc.setLocalDescription(answer);
  //     this.socket.emit("signal", { from: this.state.myAvatar._id, to: fromId, type: "answer", data: answer });
  //     this.setState({ connectedPeers: Object.keys(this.peerConnections) });
  //   } catch (err) {
  //     console.error(`[WebRTC] Error handling offer from ${fromId}:`, err);
  //   }
  // };

  // handleAnswer = async (fromId, answer) => {
  //   try {
  //     const pc = this.peerConnections[fromId];
  //     if (!pc) return console.error(`[WebRTC] No connection found for ${fromId}`);
  //     // Safe setRemoteDescription with fallback
  //     await this.safeSetRemoteDescription(pc, answer);
  //   } catch (err) {
  //     console.error("[WebRTC] setRemoteDescription failed for answer from", fromId, err);
  //   }
  // };

  // handleCandidate = async (fromId, candidate) => {
  //   try {
  //     const pc = this.peerConnections[fromId];
  //     if (!pc || !candidate) return;
  //     await this.safeAddIceCandidate(pc, candidate);
  //   } catch (err) {
  //     console.error("[WebRTC] addIceCandidate failed from", fromId, err);
  //   }
  // };


  
safeSetRemoteDescription = async (pc, desc) => {
  if (!pc) return;
  try {
    // Accept either plain object or RTCSessionDescription
    await pc.setRemoteDescription(desc);
  } catch (err) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(desc));
    } catch (e2) { throw e2; }
  }

  // Drain any queued ICE candidates after remote description is set
  if (pc._pendingCandidates && pc._pendingCandidates.length) {
    const pending = pc._pendingCandidates.splice(0);
    for (const cand of pending) {
      try { await pc.addIceCandidate(cand); } catch (e) { console.warn("drain candidate failed:", e); }
    }
  }
};

safeAddIceCandidate = async (pc, cand) => {
  if (!pc || !cand) return;
  // If remote description not yet applied, queue candidate
  const remoteDescPresent = !!(pc.remoteDescription && pc.remoteDescription.type);
  try {
    if (!remoteDescPresent) {
      pc._pendingCandidates = pc._pendingCandidates || [];
      pc._pendingCandidates.push(cand);
      return;
    }
    await pc.addIceCandidate(cand);
  } catch (err) {
    try { await pc.addIceCandidate(new RTCIceCandidate(cand)); }
    catch (e2) {
      // Non-fatal; log and continue
      console.warn("safeAddIceCandidate second attempt failed:", e2);
    }
  }
};


/* ---------- Offer / Answer / Candidate handlers (perfect negotiation) ---------- */

handleOffer = async (fromId, offer) => {
  try {
    const pc = this.createPeerConnection(fromId);
    // collision detection
    const makingOffer = !!pc._makingOffer;
    const notStable = pc.signalingState !== "stable";
    const offerCollision = makingOffer || notStable;

    // If we are impolite and there is an offer collision -> ignore the offer
    if (!pc._polite && offerCollision) {
      pc._ignoreOffer = true;
      console.warn("[handleOffer] Ignoring offer due to collision (impolite)", fromId, { signalingState: pc.signalingState, _makingOffer: pc._makingOffer });
      return;
    }
    pc._ignoreOffer = false;

    if (offerCollision) {
      // polite peer: rollback local description if needed
      try { await pc.setLocalDescription({ type: "rollback" }); } catch (rbErr) { console.warn("rollback failed:", rbErr); }
    }

    // Apply remote offer (use safe helper)
    await this.safeSetRemoteDescription(pc, offer);

    // Add local tracks if we want to send audio/video
    if (this.state.isVideoOn || this.state.isAudioOn) {
      if (!this.state.localStream) await this.ensureLocalStream();
      const localStream = this.state.localStream;
      localStream.getTracks().forEach(track => {
        if (!pc.getSenders().some(s => s.track === track)) {
          try { pc.addTrack(track, localStream); } catch (e) { console.warn("addTrack while answering err", e); }
        }
      });
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit("signal", { from: this.state.myAvatar._id, to: fromId, type: "answer", data: answer });
    this.setState({ connectedPeers: Object.keys(this.peerConnections) });
  } catch (err) {
    console.error(`[WebRTC] handleOffer error from ${fromId}:`, err);
  }
};

handleAnswer = async (fromId, answer) => {
  try {
    const pc = this.peerConnections[fromId];
    if (!pc) return console.error(`[WebRTC] No pc for answer from ${fromId}`);
    await this.safeSetRemoteDescription(pc, answer);
  } catch (err) {
    console.error("[WebRTC] handleAnswer failed:", err);
  }
};

handleCandidate = async (fromId, candidate) => {
  try {
    const pc = this.peerConnections[fromId];
    if (!pc) {
      console.warn("handleCandidate: no pc yet, creating one to queue candidate", fromId);
      // create stub pc so candidate can be queued
      this.createPeerConnection(fromId);
    }
    await this.safeAddIceCandidate(this.peerConnections[fromId], candidate);
  } catch (err) {
    console.error("[WebRTC] handleCandidate failed:", err);
  }
};
  cleanupWebRTC = () => {
    Object.keys(this.peerConnections).forEach(pid => {
      try { this.peerConnections[pid].close(); } catch(e) {}
      delete this.peerConnections[pid];
    });
    Object.keys(this.dataChannels).forEach(pid => {
      try { this.dataChannels[pid].close?.(); } catch(e) {}
      delete this.dataChannels[pid];
    });
    if (this.state.localStream) {
      try { this.state.localStream.getTracks().forEach(t => { try { t.stop(); } catch(e){} }); } catch(e){}
    }
    document.querySelectorAll('video[id^="video-"]').forEach(el => { try { el.srcObject = null; } catch(e){} });
    document.querySelectorAll('audio[id^="audio-"]').forEach(el => { try { el.srcObject = null; el.remove(); } catch(e){} });

    this.setState({
      peers: {},
      connectedPeers: [],
      localStream: null,
      isAudioOn: false,
      isVideoOn: false,
      showVideo: false,
      activeOverlayPeers: []
    });
  };

  enableAudioPlayback = async () => {
    const els = document.querySelectorAll('video[id^="video-"], audio[id^="audio-"]');
    for (const el of els) {
      try {
        const isLocal = el.id === `video-${this.state.userData?._id}`;
        if (!isLocal) el.muted = false;
        await el.play();
      } catch (err) { console.warn("enableAudioPlayback: play blocked for", el.id, err); }
    }
    try { if (window.audioContext && typeof window.audioContext.resume === "function") await window.audioContext.resume(); } catch(e){}
  }

  ensureLocalStream = async () => {
    if (this.state.localStream) return this.state.localStream;
    try {
      // Request both audio+video; callers may disable tracks later
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!this._isMounted) { stream.getTracks().forEach(t => t.stop()); return null; }
      this.setState({ localStream: stream, isAudioOn: true, isVideoOn: true }, () => {
        const localVideo = document.getElementById(`video-${this.state.userData?._id}`);
        if (localVideo) localVideo.srcObject = stream;
      });
      return stream;
    } catch (err) {
      console.warn("Failed to get user media:", err);
      // Friendly user notice
      try { alert("Could not access camera/mic. Please check permissions and reload the page."); } catch(e){}
      return null;
    }
  };

  // Toggle video: safer — enable/disable tracks and renegotiate if necessary
  toggleVideo = async () => {
    const currentlyOn = this.state.isVideoOn;
    if (!currentlyOn) {
      // enable video
      let stream = this.state.localStream;
      if (!stream) {
        stream = await this.ensureLocalStream();
        if (!stream) return;
      }
      // enable video tracks (if they exist) or get new stream
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        // rare case: we lost tracks, re-acquire
        stream.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
        stream = await this.ensureLocalStream();
        if (!stream) return;
      } else {
        videoTracks.forEach(t => t.enabled = true);
      }

      // attach/ensure tracks are added to peer connections and renegotiate
      const nearbyIds = this.state.activeOverlayPeers || [];
      for (const pid of nearbyIds) {
        try {
          const pc = this.createPeerConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
          stream.getVideoTracks().forEach(track => {
            if (!pc.getSenders().some(s => s.track === track)) {
              try { pc.addTrack(track, stream); } catch (e) { console.warn(e); }
            }
          });
          // politely renegotiate if remoteDescription already present
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await this.renegotiatePeer(pc, pid);
          } else {
            // if we don't have remoteDescription, initiating connection will create offer
            await this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
          }
        } catch (e) { console.warn("toggleVideo - error connecting to", pid, e); }
      }

      this.setState({ isVideoOn: true, showVideo: true }, () => {
        try { this.socket.emit("video-toggle", { userId: this.state.myAvatar._id, enabled: true }); } catch (e) {}
      });
    } else {
      // turn off video (disable tracks but do not stop them — keeps re-enable reliable)
      if (this.state.localStream) {
        try {
          this.state.localStream.getVideoTracks().forEach(t => t.enabled = false);
        } catch (e) { console.warn("toggleVideo off error", e); }
      }
      this.setState({ isVideoOn: false }, () => {
        try { this.socket.emit("video-toggle", { userId: this.state.myAvatar._id, enabled: false }); } catch (e) {}
      });
    }
  };

  toggleAudio = async () => {
    const currentlyOn = this.state.isAudioOn;
    if (!currentlyOn) {
      if (!this.state.localStream) await this.ensureLocalStream();
      if (this.state.localStream) {
        this.state.localStream.getAudioTracks().forEach(t => t.enabled = true);
        const nearbyIds = this.state.activeOverlayPeers || [];
        for (const pid of nearbyIds) {
          try {
            const pc = this.createPeerConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
            this.state.localStream.getAudioTracks().forEach(track => {
              if (!pc.getSenders().some(s => s.track === track)) {
                try { pc.addTrack(track, this.state.localStream); } catch (e) { console.warn(e); }
              }
            });
            if (pc.remoteDescription && pc.remoteDescription.type) await this.renegotiatePeer(pc, pid);
            else await this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" });
          } catch (e) { console.warn("toggleAudio err", e); }
        }
      }
      this.setState({ isAudioOn: true });
    } else {
      if (this.state.localStream) this.state.localStream.getAudioTracks().forEach(t => t.enabled = false);
      this.setState({ isAudioOn: false });
    }
  };

  // FILE helpers (unchanged)
  sendFile = async (file) => {
    if (!file) return;
    const fromId = this.state.userData?._id || this.state.myAvatar?._id || "me";
    const fromName = this.state.userData?.name || this.state.myAvatar?.name || "Me";
    const pendingId = `p-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const localUrl = URL.createObjectURL(file);
    this.setState(prev => ({ chatMessages: [...prev.chatMessages, { _pendingId: pendingId, fromId, fromName, isFile: true, fileName: file.name, fileUrl: localUrl, uploading: true, ts: Date.now() }] }));

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roomId", this.roomId || "");
      fd.append("fromId", fromId);      // helpful metadata
      fd.append("fromName", fromName);
      fd.append("token", Cookies.get("jwt_token") || "");
      fd.append("zone", this.currentZone || "");

      const res = await fetch("http://localhost:5000/api/files/upload", {
        method: "POST",
        body: fd,
        credentials: "include"
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=>null);
        throw new Error(`Upload failed: ${res.status} ${txt||""}`);
      }
      const data = await res.json();
      const fileUrl = data.fileUrl ? (data.fileUrl.startsWith("http") ? data.fileUrl : `https://major-project-backend-u1ju.onrender.com${data.fileUrl}`) : `https://major-project-backend-u1ju.onrender.com/api/files/${data.fileId}`;
      this.setState(prev => ({ chatMessages: prev.chatMessages.map(m => m._pendingId === pendingId ? ({ fromId, fromName, isFile: true, fileName: data.fileName || file.name, fileUrl, fileId: data.fileId, uploading: false, ts: Date.now() }) : m) }));
    } catch (err) {
      console.error("sendFile upload error:", err);
      this.setState(prev => ({ chatMessages: prev.chatMessages.map(m => m._pendingId === pendingId ? ({ ...m, uploading: false, uploadError: err.message || "Upload failed" }) : m) }));
    }
  };

  sendFileToPeer = (peerId, file) => {
    return new Promise(async (resolve, reject) => {
      const dc = this.dataChannels[peerId];
      if (!dc) return reject(new Error("No data channel to peer " + peerId));
      if (dc.readyState !== "open") {
        const waitOpen = new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error("DataChannel open timeout")), 5000);
          const onopen = () => { clearTimeout(to); dc.removeEventListener("open", onopen); res(); };
          dc.addEventListener("open", onopen);
        });
        try { await waitOpen; } catch (err) { return reject(err); }
      }

      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const meta = { type: "file-meta", fileId, filename: file.name, size: file.size, mime: file.type || "application/octet-stream" };
      try { dc.send(JSON.stringify(meta)); } catch (err) { return reject(err); }

      try {
        const reader = file.stream ? file.stream().getReader() : null;
        if (reader) {
          const pump = async () => {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              dc.send(value.buffer || value);
            }
          };
          await pump();
          resolve();
        } else {
          let offset = 0;
          while (offset < file.size) {
            const slice = file.slice(offset, offset + FILE_CHUNK_SIZE);
            const ab = await slice.arrayBuffer();
            dc.send(ab);
            offset += ab.byteLength;
          }
          resolve();
        }
      } catch (err) { reject(err); }
    });
  };

  // UI + rendering
  render() {
    const { onlineUsers, offlineUsers, isSidebarCollapsed, showChatPanel, chatMessages, activeTab, peers, userData, localStream, isAudioOn, isVideoOn } = this.state;
    const zoneUserIds = new Set([this.state.userData?._id, ...(this.state.activeOverlayPeers || [])]);
    return (
      <div className="meeting-container">
        <div className="meeting-header">
          <div className="meeting-icons-container"><FaHome className="meeting-icons" /></div>
          <div className="meeting-top-controls">
            <button onClick={this.toggleAudio} className="icon-btn"><IoMdMic style={{ color: isAudioOn ? "green" : "red" }} /></button>
            <button onClick={this.toggleVideo} className="icon-btn"><FaVideo style={{ color: isVideoOn ? "green" : "red" }} /></button>
            <button onClick={() => this.setState(prev => ({ showChatPanel: !prev.showChatPanel }))} className="icon-btn"><FiMessageCircle /></button>
          </div>
        </div>

        <div className="meeting-body-container">
          <div className={`meeting-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
            {!isSidebarCollapsed && (
              <div className="sidebar-tabs">
                <button className={activeTab === "users" ? "active-tab" : ""} onClick={() => this.setState({ activeTab: "users" })}>Users</button>
                <button className={activeTab === "meeting" ? "active-tab" : ""} onClick={() => this.setState({ activeTab: "meeting" })}>Meeting</button>
              </div>
            )}

            {!isSidebarCollapsed && (
              <div className="sidebar-tab-content">
                {activeTab === "users" ? (
                  <>
                    <h2 className="meeting-heading">Online</h2>
                    <div className="meeting-online">{onlineUsers.map(u => (
                      <div className="meeting-user" key={u._id}>
                        <img className="meeting-img" src={u.avatar || avatarSprite} alt="avatar" />
                        <p className="userName">{u._id === userData?._id ? `${u.name} (You)` : u.name}</p>
                        <span className="status-dot green" />
                      </div>
                    ))}</div>

                    <h2 className="meeting-heading">Offline</h2>
                    <div className="meeting-offline">{offlineUsers.map(u => (
                      <div className="meeting-user" key={u._id}>
                        <img className="meeting-img" src={u.avatar || avatarSprite} alt="avatar" />
                        <p className="userName">{u.name}</p>
                        <span className="status-dot red" />
                      </div>
                    ))}</div>
                  </>
                ) : (
                  <div className="meeting-users-box">
                    { [...new Map([...onlineUsers, userData].filter(Boolean).filter((u) => zoneUserIds.has(u._id)).map((u) => [u._id, u])).values(),].map((u) => {
                      const peer = peers[u._id];
                      const isLocal = u._id === userData?._id;
                      const stream = isLocal ? localStream : peer?.stream;
                      return (
                        <div key={u._id} className="meeting-user-box">
                          {stream ? (
                            <video id={`video-${u._id}`} autoPlay playsInline muted={isLocal} className="meeting-user-video" ref={el => { if (el && stream && el.srcObject !== stream) { el.srcObject = stream; el.play().catch(() => {}); } }} />
                          ) : (<p className="meeting-user-name">{u.name}</p>)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`meeting-map-column ${isSidebarCollapsed ? "expanded" : ""}`}>
            <div className="meeting-map-container">
              <canvas id="mapCanvas" width={800} height={600} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>

          {showChatPanel && (
            <div className="overlay-chat-panel">
              <div className="chat-header">
                <span className="chat-title">Chat</span>
                <div className="chat-header-icons"><FiX className="chat-header-icon" onClick={() => this.setState({ showChatPanel: false })} /></div>
              </div>
              <div className="overlay-chat-messages">
                {chatMessages.map((m, idx) => {
                  const isSelf = m.fromId === this.state.userData?._id;
                  return (
                    <div key={idx} className={`overlay-chat-message ${isSelf ? "msg-right" : "msg-left"}`}>
                      <div className="msg-content">
                        <strong className="msg-name">{m.fromName || (isSelf ? this.state.userData?.name : "User")}</strong>
                        {m.isFile ? <a href={m.fileUrl} target="_blank" rel="noreferrer" download>{m.fileName}</a> : <span className="msg-name-text">{m.text}</span>}
                        {m.uploading && <span style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>Uploading...</span>}
                        {m.uploadError && <span style={{ fontSize: 12, color: "red", marginTop: 4 }}>{m.uploadError}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <ChatInput onSend={msg => this.sendChatMessage(msg)} onSendFile={file => this.sendFile(file)} />
            </div>
          )}
        </div>
      </div>
    );
  }

  handlePeerClose = (peerId) => {
    if (this.peerConnections[peerId]) {
      try { this.peerConnections[peerId].close(); } catch (e) { console.warn(e); }
      delete this.peerConnections[peerId];
    }
    if (this.dataChannels[peerId]) {
      try { this.dataChannels[peerId].close?.(); } catch (e) {}
      delete this.dataChannels[peerId];
    }
    try {
      const audioEl = document.getElementById(`audio-${peerId}`);
      if (audioEl) { audioEl.srcObject = null; audioEl.remove(); }
    } catch (e) {}

    this.setState(prev => {
      const newPeers = { ...prev.peers };
      delete newPeers[peerId];
      return { peers: newPeers, connectedPeers: prev.connectedPeers.filter(id => id !== peerId) };
    });
  };

  preloadImages = async (urls = []) => {
    await Promise.all(urls.map(url => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn("Failed to load:", url); resolve(img); };
      img.src = url;
    })));
    console.log("Images preloaded");
  };

  handleKeyDown = (e) => { if (!e.key) return; this.keysPressed[e.key] = true; };
  handleKeyUp = (e) => { if (!e.key) return; delete this.keysPressed[e.key]; };

  startAnimationLoop = () => {
    const loop = () => {
      if (!this._isMounted) return;
      this.updateAvatarPosition();
      this.drawCanvas();
      // proximity check happens inside updateAvatarPosition when movement occurs (keeps cheaper)
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
    const moved = (x !== this.state.myAvatar.x || y !== this.state.myAvatar.y);

    if (!this.checkCollision(x, y) && moved) {
      this.setState(prev => ({ myAvatar: { ...prev.myAvatar, x, y } }), () => {
        if (this.socket && this.state.userData) this.socket.emit("move", { roomId: this.roomId, x, y });
        const meId = this.state.userData?._id;
        if (meId) {
          this.setState(prev => ({ onlineUsers: prev.onlineUsers.map(u => u._id === meId ? ({ ...u, x, y, zone: this.computeZoneForUser({ ...u, x, y }) }) : u) }));
        }
        this.checkProximityAndManagePeers();
      });
    } else {
      // no move — still keep UI consistent
    }

    const hasPeers = Object.keys(this.peerConnections).length > 0;
    if (hasPeers !== this.state.showVideo) this.setState({ showVideo: hasPeers });
  };

  checkCollision = (x, y) => {
    const avatar = this.state.myAvatar; if (!avatar) return false;
    const avatarW = avatar.width || 32; const avatarH = avatar.height || 32;
    const collisionLayer = mapData.layers?.find(l => l.name === "Collision");
    const collisions = collisionLayer?.objects || [];
    for (const obj of collisions) {
      if (x < obj.x + obj.width && x + avatarW > obj.x && y < obj.y + obj.height && y + avatarH > obj.y) return true;
    }
    return false;
  };

  drawCanvas = () => {
    const canvas = document.getElementById("mapCanvas");
    if (!canvas || !this.mapImg || !this.spriteImg) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / this.mapImg.width;
    const scaleY = canvas.height / this.mapImg.height;
    ctx.drawImage(this.mapImg, 0, 0, canvas.width, canvas.height);

    const collisions = mapData.layers?.find(l => l.name === "Collision")?.objects || [];
    if (collisions.length) {
      ctx.save(); ctx.strokeStyle = "red"; ctx.globalAlpha = 0.3;
      collisions.forEach(obj => ctx.strokeRect(obj.x * scaleX, obj.y * scaleY, obj.width * scaleX, obj.height * scaleY));
      ctx.restore();
    }

    const interactiveZones = this.interactiveZones || mapData.layers?.find(l => l.name === INTERACTABLES_LAYER_NAME)?.objects || [];
    if (interactiveZones.length) {
      ctx.save(); ctx.strokeStyle = "rgba(0,128,255,0.6)"; ctx.lineWidth = 2;
      interactiveZones.forEach(z => {
        ctx.strokeRect(z.x * scaleX, z.y * scaleY, z.width * scaleX, z.height * scaleY);
        const label = (Array.isArray(z.properties) ? z.properties.find(p => p.name === 'name')?.value : null) || z.name || `id:${z.id}`;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.font = `${12 * scaleX}px Arial`; ctx.fillText(label, z.x * scaleX + 4, z.y * scaleY + 12);
      });
      ctx.restore();
    }

    const drawAvatar = (u) => {
      if (!u) return;
      try {
        const sx = 0, sy = 0, sw = 128, sh = 128;
        const dx = (u.x || 0) * scaleX;
        const dy = (u.y || 0) * scaleY;
        const dw = (u.width || 32) * scaleX;
        const dh = (u.height || 32) * scaleY;
        ctx.drawImage(this.spriteImg, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.fillStyle = "white"; ctx.font = "14px Arial"; ctx.fillText(u.name || "User", dx, dy - 6);
      } catch (e) { console.warn("Avatar draw error:", e); }
    };
    drawAvatar(this.state.myAvatar);
    (this.state.onlineUsers || []).forEach(drawAvatar);
  };

  // PROXIMITY: determines who is in the same zone and manages peers
  checkProximityAndManagePeers = () => {
    const me = this.state.myAvatar;
    const online = this.state.onlineUsers || [];

    if (!me || me.x == null || me.y == null) {
      if (this.state.showProximityUI || this.state.showSidebar) this.setState({ showProximityUI: false, showSidebar: false, activeOverlayPeers: [] });
      if (this.currentZone) { this.currentZone = null; try { this.sendLeaveZone(); } catch(e){} }
      this.cleanupWebRTC();
      return;
    }

    const myId = this.state.userData?._id || this.state.myAvatar?._id || null;
    const myCenterX = me.x + ((me.width || 32) / 2);
    const myCenterY = me.y + ((me.height || 32) / 2);
    const myZone = this.getZoneForPosition(myCenterX, myCenterY);

    if (this.currentZone !== myZone) {
      if (this.currentZone != null) { try { this.sendLeaveZone(); } catch (e) {} }
      this.currentZone = myZone;
      if (myZone != null) { try { this.sendEnterZone(myZone); } catch (e) {} }
    }

    if (!myZone) {
      Object.keys(this.peerConnections).forEach(pid => this.handlePeerClose(pid));
      this.setState({ showProximityUI: false, showSidebar: false, activeOverlayPeers: [] });
      return;
    }

    const peersInSameZone = online.filter(u => {
      if (!u || !u._id) return false;
      if (myId && u._id === myId) return false;
      const ux = (typeof u.x === "number" ? u.x : 0) + ((u.width || 32) / 2);
      const uy = (typeof u.y === "number" ? u.y : 0) + ((u.height || 32) / 2);
      const zoneForU = this.getZoneForPosition(ux, uy);
      return zoneForU === myZone;
    }).map(u => u._id);

    const peersInSameZoneSet = new Set(peersInSameZone);
    Object.keys(this.peerConnections).forEach(pid => { if (!peersInSameZoneSet.has(pid)) this.handlePeerClose(pid); });

    const wantMedia = this.state.isAudioOn || this.state.isVideoOn;
    if (wantMedia) {
      peersInSameZone.forEach(pid => {
        if (!this.peerConnections[pid]) {
          this.initiateConnection(pid, { username: this.state.onlineUsers.find(u => u._id === pid)?.name || "User" }).catch(err => console.warn("initiateConnection err", err));
        }
      });
    }

    const shouldShowUI = peersInSameZone.length > 0;
    this.setState({ showProximityUI: shouldShowUI, showSidebar: shouldShowUI, activeOverlayPeers: peersInSameZone, connectedPeers: Object.keys(this.peerConnections) });
  };

  sendChatMessage = (message) => {
    if (!message.trim() || !this.socket) return;

    // block chat outside zone
    if (!this.currentZone) {
      console.warn("Cannot send chat: not inside any zone");
      return;
    }

    // send to server (server will echo/forward to zone)
    this.socket.emit("chat", { message: message.trim() });
    // optimistic append so user sees their message
    this.setState(prev => ({ chatMessages: [...prev.chatMessages, { fromId: this.state.userData?._id || "me", fromName: this.state.userData?.name || "Me", text: message.trim(), ts: Date.now() }] }));
  };
}

// ChatInput component (unchanged)
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
  onKey = (e) => { if (e.key === "Enter") this.onSend(); };

  onFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (this.props.onSendFile) this.props.onSendFile(file);
    e.target.value = "";
  };

  render() {
    return (
      <div className="chat-input-bar">
        <label className="chat-icon">
          <IoAttach />
          <input type="file" ref={this.fileRef} onChange={this.onFileChange} style={{ display: "none" }} />
        </label>

        <input value={this.state.text} onChange={this.onChange} onKeyDown={this.onKey} placeholder="Enter your message" className="chat-input" />

        <div className="chat-icon" onClick={this.onSend}><IoSend /></div>
      </div>
    );
  }
}

export default Meeting;
