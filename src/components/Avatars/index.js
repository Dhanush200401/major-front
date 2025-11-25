// import React, { Component } from "react";
// import "./index.css";

// // Import your avatar images
// import A1 from "./images/A1.png";
// import A2 from "./images/A2.png";
// import A3 from "./images/A3.png";
// import A4 from "./images/A4.png";
// import A5 from "./images/A5.png";
// import A6 from "./images/A6.png";
// import A7 from "./images/A7.png";
// import A8 from "./images/A8.png";

// class Avatar extends Component {
//   constructor(props) {
//     super(props);
//     this.state = {
//       selectedAvatar: A1, // default avatar
//       saving: false,
//     };
//   }

//   handleAvatarClick = (avatar) => {
//     this.setState({ selectedAvatar: avatar });
//   };

//   handleOk = async () => {
//     const { selectedAvatar } = this.state;
//     const { history } = this.props;

//     const token = localStorage.getItem("jwt_token"); // ✅ Read token from localStorage

//     if (!token) {
//       alert("You must be logged in to save your avatar.");
//       return;
//     }

//     this.setState({ saving: true });

//     try {
//       const response = await fetch("http://localhost:5000/api/avatar", { // ✅ Correct API path
//         method: "PUT",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: token, // ✅ Send token
//         },
//         body: JSON.stringify({ avatar: selectedAvatar }),
//       });

//       const data = await response.json();

//       if (response.ok) {
//         alert("✅ Avatar saved successfully");
//         history.replace("/"); // redirect to home
//       } else {
//         alert(data.error_msg || "Error saving avatar");
//       }
//     } catch (err) {
//       console.error("Avatar update error:", err);
//       alert("Server error while saving avatar");
//     } finally {
//       this.setState({ saving: false });
//     }
//   };

//   render() {
//     const { selectedAvatar, saving } = this.state;
//     const avatars = [A1, A2, A3, A4, A5, A6, A7, A8];

//     return (
//       <div className="avatar-page">
//         <div className="avatar-card">
//           {/* Username */}
//           <h2 className="avatar-username">Choose your avatar</h2>

//           {/* Selected Avatar */}
//           <div className="selected-avatar">
//             <img src={selectedAvatar} alt="selected avatar" />
//           </div>

//           {/* Avatar Grid */}
//           <div className="avatar-grid">
//             {avatars.map((avatar, index) => (
//               <img
//                 key={index}
//                 src={avatar}
//                 alt={`avatar-${index + 1}`}
//                 className="avatar-option"
//                 onClick={() => this.handleAvatarClick(avatar)}
//               />
//             ))}
//           </div>

//           {/* OK Button */}
//           <button className="ok-btn" onClick={this.handleOk} disabled={saving}>
//             {saving ? "Saving..." : "OK"}
//           </button>
//         </div>
//       </div>
//     );
//   }
// }

// export default Avatar;




















import React, { Component } from "react";
import "./index.css";

import A1 from "./images/A1.png";
import A2 from "./images/A2.png";
import A3 from "./images/A3.png";
import A4 from "./images/A4.png";
import A5 from "./images/A5.png";
import A6 from "./images/A6.png";
import A7 from "./images/A7.png";
import A8 from "./images/A8.png";
const API = process.env.REACT_APP_BACKEND_URL;

class Avatar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedAvatar: A1,
      saving: false,
    };
  }

  _isMounted = false;

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  handleAvatarClick = (avatar) => {
    if (this._isMounted) {
      this.setState({ selectedAvatar: avatar });
    }
  };

  handleOk = async () => {
    const { selectedAvatar } = this.state;
    const { history } = this.props;

    if (this._isMounted) this.setState({ saving: true });

    try {
      const response = await fetch(`${API}/api/avatar`, {
        method: "PUT",
        credentials: "include", // ✅ ensures jwt_token cookie is sent
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ avatar: selectedAvatar }),
      });

      const data = await response.json();

      if (response.ok) {
        alert("Avatar saved successfully");
        history.replace("/"); // ✅ safe redirect
      } else {
        alert(data.error_msg || "Error saving avatar");
      }
    } catch (err) {
      console.error("Avatar update error:", err);
      alert("Server error while saving avatar");
    } finally {
      if (this._isMounted) this.setState({ saving: false });
    }
  };

  render() {
    const { selectedAvatar, saving } = this.state;
    const avatars = [A1, A2, A3, A4, A5, A6, A7, A8];

    return (
      <div className="avatar-page">
        <div className="avatar-card">
          <h2 className="avatar-username">Choose your avatar</h2>

          <div className="selected-avatar">
            <img src={selectedAvatar} alt="selected avatar" />
          </div>

          <div className="avatar-grid">
            {avatars.map((avatar, index) => (
              <img
                key={index}
                src={avatar}
                alt={`avatar-${index + 1}`}
                className="avatar-option"
                onClick={() => this.handleAvatarClick(avatar)}
              />
            ))}
          </div>

          <button className="ok-btn" onClick={this.handleOk} disabled={saving}>
            {saving ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    );
  }
}

export default Avatar;