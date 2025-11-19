
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Cookies from "js-cookie";
export default function useSocket({ onConnect, onPresence, onSignal, onMove, onChat } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io("https://major-project-backend-u1ju.onrender.com", {
      transports: ["websocket"],
      withCredentials: true, // send cookies on handshake
      auth: { token: Cookies.get("jwt_token") }
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
