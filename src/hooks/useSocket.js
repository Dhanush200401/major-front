// // /hooks/useSocket.js
// import { useEffect, useRef } from "react";
// import { io } from "socket.io-client";
// import Cookies from "js-cookie";

// /**
//  * useSocket hook
//  *
//  * Usage:
//  *  const socketRef = useSocket({
//  *    onConnect: (socket) => {},
//  *    onPresence: (data) => {},
//  *    onSignal: (data) => {},
//  *    onMove: (data) => {},
//  *    onChat: (data) => {}
//  *  });
//  *
//  * Automatically connects only if JWT token exists in cookies.
//  */
// export default function useSocket({
//   onConnect = () => {},
//   onPresence = () => {},
//   onSignal = () => {},
//   onMove = () => {},
//   onChat = () => {},
// } = {}) {
//   const socketRef = useRef(null);

//   useEffect(() => {
//     const token = Cookies.get("jwt_token");

//     if (!token) {
//       console.warn("No JWT token found in cookies — socket not connecting.");
//       return;
//     }

//     // Initialize socket
//     const socket = io("http://localhost:5000", {
//       auth: { token },
//       transports: ["websocket"],
//       reconnection: true,
//       reconnectionAttempts: 5,
//       reconnectionDelay: 1000,
//     });

//     socketRef.current = socket;

//     // Connect event
//     socket.on("connect", () => {
//       console.log("🔌 Socket connected:", socket.id);

//       // Emit join with optional user info (if backend expects)
//       socket.emit("join", { token }); 

//       onConnect(socket);
//     });

//     // Presence updates (online/offline users)
//     socket.on("presence", (data) => {
//       onPresence(data);
//     });

//     // Signal events (WebRTC, etc.)
//     socket.on("signal", (data) => {
//       onSignal(data);
//     });

//     // Avatar movements / game movements
//     socket.on("move", (data) => {
//       onMove(data);
//     });

//     // Chat messages
//     socket.on("chat", (data) => {
//       onChat(data);
//     });

//     // Handle connection errors
//     socket.on("connect_error", (err) => {
//       console.error("❌ Socket connect_error:", err.message || err);

//       // Optional: handle invalid token (backend can emit 'unauthorized')
//       if (err.message === "invalid token") {
//         socket.disconnect();
//         Cookies.remove("jwt_token");
//         window.location.href = "/login";
//       }
//     });

//     // Cleanup on unmount
//     return () => {
//       if (socketRef.current) {
//         socketRef.current.disconnect();
//         socketRef.current = null;
//       }
//     };
//   }, [onConnect, onPresence, onSignal, onMove, onChat]);

//   return socketRef;
// }

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export default function useSocket({ onConnect, onPresence, onSignal, onMove, onChat } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io("https://major-project-backend-u1ju.onrender.com", {
      transports: ["websocket"],
      withCredentials: true, // send cookies on handshake
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Socket connected:", socket.id);
      onConnect && onConnect(socket);
    });

    socket.on("presence", (p) => onPresence && onPresence(p));
    socket.on("signal", (s) => onSignal && onSignal(s));
    socket.on("move", (m) => onMove && onMove(m));
    socket.on("chat", (c) => onChat && onChat(c));

    socket.on("connect_error", (err) => {
      console.error("❌ Socket connect_error:", err.message || err);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onConnect, onPresence, onSignal, onMove, onChat]);

  return socketRef;
}
