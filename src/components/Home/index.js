import { Component } from "react";
import "./index.css";
import Avt from "./images/Avt1.png";
import { io } from "socket.io-client";

class Home extends Component {
  state = {
    user: null,
    joinRoomId: "",
    joinPassword: "",
    createRoomId: "",
    createPassword: "",
    socketConnected: false,
  };

  componentDidMount() {
    // ✅ Fetch user profile from backend
    this.getUserDetails();

    // ✅ Initialize socket (no need to manually send token, cookie is used)
    this.socket = io("https://major-project-backend-u1ju.onrender.com", {
      withCredentials: true,
      transports: ["websocket"],
      auth: { token: Cookies.get("jwt_token") }
    });

    this.socket.on("connect", () => {
      console.log("🔌 Socket connected:", this.socket.id);
      this.setState({ socketConnected: true });
    });

    this.socket.on("connect_error", (err) => {
      console.error("❌ Socket connect_error:", err.message);
    });
  }

  componentWillUnmount() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  // ======================
  // Fetch user profile
  // ======================
  getUserDetails = async () => {
    try {
      const response = await fetch("https://major-project-backend-u1ju.onrender.com/api/auth/me", {
        method: "GET",
        credentials: "include", // ✅ cookie travels
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (response.ok) {
        this.setState({ user: data });
      } else {
        alert(data.error_msg || "Cannot fetch profile");
        this.props.history.replace("/login");
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching profile");
      this.props.history.replace("/login");
    }
  };

  // ======================
  // Join room
  // ======================
  handleJoinRoom = async (e) => {
    e.preventDefault();
    const { joinRoomId, joinPassword } = this.state;

    try {
      const response = await fetch("https://major-project-backend-u1ju.onrender.com/api/rooms/join", {
        method: "POST",
        credentials: "include", // ✅ send cookie
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomId: joinRoomId, password: joinPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.success_msg);

        if (this.socket && this.state.socketConnected) {
          this.socket.emit("join", { roomId: joinRoomId });
        }

        this.props.history.push(`/meeting?roomId=${joinRoomId}`);
      } else {
        alert(data.error_msg || "Failed to join room");
      }
    } catch (err) {
      console.error(err);
      alert("Error joining room");
    }
  };

  // ======================
  // Create room
  // ======================
  handleCreateRoom = async (e) => {
    e.preventDefault();
    const { createRoomId, createPassword } = this.state;

    try {
      const response = await fetch("https://major-project-backend-u1ju.onrender.com/api/rooms/create", {
        method: "POST",
        credentials: "include", // ✅ send cookie
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomId: createRoomId, password: createPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.success_msg);

        if (this.socket && this.state.socketConnected) {
          this.socket.emit("join", { roomId: createRoomId }); // Emit join after create
        }

        this.props.history.push(`/meeting?roomId=${createRoomId}`);
      } else {
        alert(data.error_msg || "Failed to create room");
      }
    } catch (err) {
      console.error(err);
      alert("Error creating room");
    }
  };

  render() {
    const {
      user,
      joinRoomId,
      joinPassword,
      createRoomId,
      createPassword,
      socketConnected,
    } = this.state;

    if (!user) return <h2>Loading...</h2>;

    return (
      <div className="room-container">
        <header className="roomtitle-card">
          <h1 className="brand-title">BubbleSpace</h1>
          <div className="profile">
            <span className="profile-name">{user.name}</span>
            <img
              src={user.avatar || "https://via.placeholder.com/40"}
              alt="User Avatar"
              className="profile-avatar"
            />
          </div>
        </header>

        <div className="main-content">
          <div className="form-section">
            <p style={{ color: socketConnected ? "green" : "red" }}>
              {socketConnected ? "🟢 Socket Connected" : "🔴 Socket Disconnected"}
            </p>

            {/* Join Room */}
            <form className="form-block" onSubmit={this.handleJoinRoom}>
              <h2 className="form-title">
                Join your <span className="highlight">Virtual Space</span>
              </h2>
              <input
                type="text"
                placeholder="Room ID"
                value={joinRoomId}
                onChange={(e) => this.setState({ joinRoomId: e.target.value })}
                className="join-room-id-field"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={joinPassword}
                onChange={(e) => this.setState({ joinPassword: e.target.value })}
                className="join-room-pass-field"
                required
              />
              <button className="btn create-btn" type="submit">
                Join
              </button>
            </form>

            <hr className="divider" />

            {/* Create Room */}
            <form className="form-block" onSubmit={this.handleCreateRoom}>
              <h2 className="form-title">
                Create your <span className="highlight">Virtual Space</span>
              </h2>
              <input
                type="text"
                placeholder="Create Room ID"
                value={createRoomId}
                onChange={(e) => this.setState({ createRoomId: e.target.value })}
                className="create-room-id-field"
                required
              />
              <input
                type="password"
                placeholder="Create Password"
                value={createPassword}
                onChange={(e) => this.setState({ createPassword: e.target.value })}
                className="create-room-pass-field"
                required
              />
              <button className="btn create-btn" type="submit">
                Create Room
              </button>
            </form>
          </div>

          <div className="Image">
            <img src={Avt} alt="Virtual Space Illustration" />
          </div>
        </div>
      </div>
    );
  }
}

export default Home;
