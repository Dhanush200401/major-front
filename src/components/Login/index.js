import { Component } from "react";
import Cookies from "js-cookie"; // ✅ for JWT storage
import img2 from "./images/img2.png";
import img1 from "./images/img1.png";
import img3 from "./images/img3.png";
import "./index.css";
const API = process.env.REACT_APP_BACKEND_URL;

class Login extends Component {
  state = {
    email: "",
    password: "",
    showError: false,
    error: "",
    loading: false,
  };

  _isMounted = false; // ✅ track mount status

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  onChangeEmail = (event) => {
    if (this._isMounted) {
      this.setState({ email: event.target.value, showError: false });
    }
  };

  onChangePassword = (event) => {
    if (this._isMounted) {
      this.setState({ password: event.target.value, showError: false });
    }
  };

  onClickRegister = () => {
    const { history } = this.props;
    history.replace("/signup");
  };

  onLoginSuccess = () => {
  const { history } = this.props;
  history.replace("/avatars");
};


  onLoginFailure = (error) => {
    if (this._isMounted) {
      this.setState({
        showError: true,
        error,
      });
    }
  };

submitLoginForm = async (event) => {
  event.preventDefault();
  const { email, password } = this.state;

  if (this._isMounted) this.setState({ loading: true });

  try {
    const response = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include", // MUST include cookies for JWT
    });

    const data = await response.json();

    if (response.ok) {
      this.onLoginSuccess();
    } else {
      this.onLoginFailure(data.error_msg || "Login failed. Try again.");
    }
  } catch (err) {
    console.error("Login error:", err);
    this.onLoginFailure("Something went wrong. Please try again.");
  } finally {
    if (this._isMounted) this.setState({ loading: false });
  }
};



  render() {
    const { email, password, showError, error, loading } = this.state;


    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-avatar-container">
            <img className="login-img" src={img2} alt="avatar" />
            <img className="login-img" src={img1} alt="avatar" />
            <img className="login-img" src={img3} alt="avatar" />
          </div>

          <form onSubmit={this.submitLoginForm} className="login-form">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              placeholder="Enter your email"
              id="email"
              required
              onChange={this.onChangeEmail}
            />

            <label htmlFor="pass">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              id="pass"
              required
              onChange={this.onChangePassword}
            />

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>

            <p className="signup-link" onClick={this.onClickRegister}>
              Don't have an account? Register
            </p>

            {showError && <p className="error-msg">{error}</p>}
          </form>
        </div>
      </div>
    );
  }
}

export default Login;
