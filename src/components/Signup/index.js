import { Component } from "react";
import A1 from "./images/A1.png";
import A2 from "./images/A2.png";
import A3 from "./images/A3.png";
import "./index.css";

class Signup extends Component {
  state = {
    name: "",
    email: "",
    password: "",
    showError: false,
    error: "",
    loading: false,
  };

  onChangeName = (event) => {
    this.setState({ name: event.target.value, showError: false });
  };

  onChangeEmail = (event) => {
    this.setState({ email: event.target.value, showError: false });
  };

  onChangePassword = (event) => {
    this.setState({ password: event.target.value, showError: false });
  };

  onClickLogin = () => {
    const { history } = this.props;
    history.replace("/login");
  };

  onSignupSuccess = () => {
    const { history } = this.props;
    history.replace("/login"); // after signup, redirect to login
  };

  onSignupFailure = (error) => {
    this.setState({
      showError: true,
      error,
    });
  };


  componentDidMount() {
  this._isMounted = true;
}

componentWillUnmount() {
  this._isMounted = false;
}

submitSignupForm = async (event) => {
  event.preventDefault();
  const { name, email, password } = this.state;
  const userDetails = { name, email, password };

  this.setState({ loading: true });

  try {
    const response = await fetch("http://localhost:5000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(userDetails),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("jwt_token", data.jwt_token);

      // ✅ Redirect AFTER signup
      this.props.history.replace("/login"); // 👈 change here
    } else {
      this.onSignupFailure(data.error_msg || "Signup failed. Try again.");
    }
  } catch (err) {
    console.error("Signup error:", err);
    this.onSignupFailure("Something went wrong. Please try again.");
  } finally {
    if (this._isMounted) {
      this.setState({ loading: false });
    }
  }
};



  render() {
    const { showError, error, loading } = this.state;

    return (
      <div className="signup-container">
        <div className="signup-card">
          {/* Avatars */}
          <div className="signup-avatar-container">
            <img src={A1} alt="avatar1" />
            <img src={A2} alt="avatar2" />
            <img src={A3} alt="avatar3" />
          </div>

          {/* Signup Form */}
          <form onSubmit={this.submitSignupForm} className="signup-form">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              placeholder="Enter your name"
              required
              onChange={this.onChangeName}
            />

            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email address"
              required
              onChange={this.onChangeEmail}
            />

            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              required
              onChange={this.onChangePassword}
            />

            <button
              className="signup-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Registering..." : "Register / Signup"}
            </button>

            {showError && <p className="error-message">{error}</p>}

            <p className="login-link" onClick={this.onClickLogin}>
              Already have an account? Login
            </p>
          </form>
        </div>
      </div>
    );
  }
}

export default Signup;
