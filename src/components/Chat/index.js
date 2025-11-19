import React from "react";
import { FiPaperclip } from "react-icons/fi";
import { IoMdSend } from "react-icons/io";
import "./index.css";

export default function ChatBox() {
  return (
    <div className="chat-container">
      {/* Chat Header */}
      <div className="chat-header">
        <span>Project Space</span>
      </div>

      {/* Direct Messages */}
      <div className="chat-messages">
        {/* Praveen */}
        <div className="message left">
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
          <p className="bubble">Hii</p>
        </div>

        {/* Dhanu */}
        <div className="message right">
          <p className="bubble">Hello</p>
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
        </div>

        <div className="message left">
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
          <p className="bubble">What are you doing?</p>
        </div>

        <div className="message right">
          <p className="bubble">Watching Cricket</p>
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
        </div>

        <div className="message left">
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
          <p className="bubble">Enjoy.</p>
        </div>

        <div className="message right">
          <p className="bubble">What r u doing??</p>
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
        </div>

        <div className="message left">
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
          <p className="bubble">I am going to theatre with my family.</p>
        </div>

        <div className="message right">
          <p className="bubble">Wow, Have a Nice Day.</p>
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
        </div>

        <div className="message left">
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
          <p className="bubble">Ok, Lets meet Tomorrow, Bye</p>
        </div>

        <div className="message right">
          <p className="bubble">Ok, Bye</p>
          <img
            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
            alt="avatar"
            className="avatar"
          />
        </div>
      </div>

      {/* Input Section */}
      <div className="chat-input">
        <FiPaperclip className="icon" />
        <input type="text" placeholder="Enter your message" />
        <IoMdSend className="icon send" />
      </div>
    </div>
  );
}