// src/components/MapGame.js
import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import tilesetImage from "./assets/tiles/tileset.png";
import mapJSON from "./assets/tiles/Communication___room.json";
import avatarSprite from "./assets/avatars/avatars_sprites.png";

const MapGame = ({ socket, user, roomId }) => {
  const gameRef = useRef(null);
  const phaserRef = useRef(null);
  const otherPlayersRef = useRef({});
  const playerRef = useRef(null);
  const sceneRef = useRef(null);
  const collisionGroupRef = useRef(null);

  useEffect(() => {
    if (!socket || !user || !roomId) return;

    const config = {
      type: Phaser.AUTO,
      width: 1000,
      height: 600,
      parent: gameRef.current,
      physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: { preload, create, update },
    };

    function preload() {
      this.load.image("tiles", tilesetImage);
      this.load.tilemapTiledJSON("map", mapJSON);
      this.load.spritesheet("player", avatarSprite, { frameWidth: 128, frameHeight: 128 });
    }

    function create() {
      sceneRef.current = this;

      // map + layers
      const map = this.make.tilemap({ key: "map" });
      const tileset = map.addTilesetImage("communication_room", "tiles");
      const createdTileLayers = {};
      (map.layers || []).forEach(layer => {
        if (layer.type === "tilelayer") {
          const tileLayer = map.createLayer(layer.name, tileset, 0, 0);
          createdTileLayers[layer.name] = tileLayer;
          tileLayer.setCollisionByProperty?.({ collides: true });
        }
      });
      sceneRef.current.createdTileLayers = createdTileLayers;

      // collision objects
      collisionGroupRef.current = this.physics.add.staticGroup();
      const collisionLayer = map.getObjectLayer("Collision");
      (collisionLayer?.objects || []).forEach(obj => {
        const rect = this.add.rectangle(obj.x + obj.width/2, obj.y + obj.height/2, obj.width, obj.height);
        rect.setOrigin(0.5).setVisible(false);
        this.physics.add.existing(rect, true);
        collisionGroupRef.current.add(rect);
      });

      // animations
      ["down","left","right","up"].forEach((dir,i) => {
        this.anims.create({
          key:`walk-${dir}`,
          frames:this.anims.generateFrameNumbers("player",{start:i*4,end:i*4+3}),
          frameRate:10,
          repeat:-1
        });
      });

      this.cursors = this.input.keyboard.createCursorKeys();

      // socket handlers (spawn and dynamic updates)
      socket.on("onlineUsers", handleOnlineUsers);
      // accept both "move" and "userMoved" events to be robust
      socket.on("move", handleMovePayload);
      socket.on("userMoved", handleMovePayload);

      // join room
      socket.emit("joinRoom", { roomId });
    }

    function update() {
      const player = playerRef.current;
      if (!player || !sceneRef.current) return;

      const cursors = sceneRef.current.cursors;
      let vx=0, vy=0, direction=null, moving=false;
      const speed = 120;

      if (cursors.left.isDown) { vx = -speed; direction = "left"; moving = true; }
      else if (cursors.right.isDown) { vx = speed; direction = "right"; moving = true; }
      if (cursors.up.isDown) { vy = -speed; direction = "up"; moving = true; }
      else if (cursors.down.isDown) { vy = speed; direction = "down"; moving = true; }

      player.setVelocity(vx, vy);
      if (moving) player.anims.play(`walk-${direction}`, true);
      else player.anims.stop();

      // emit movement for server to broadcast
      if (moving) socket.emit("move", { roomId, x: player.x, y: player.y });
    }

    function handleOnlineUsers(users) {
      // users may be an object (currentPositions) or an array; normalize
      let normalized = [];
      if (Array.isArray(users)) {
        normalized = users.map(u => ({ id: u.userId || u._id || u.id, username: u.username || u.name, x: u.x, y: u.y }));
      } else if (users && typeof users === "object") {
        normalized = Object.entries(users).map(([uid, u]) => ({
          id: uid,
          username: u.username || u.name,
          x: u.x,
          y: u.y
        }));
      }

      // remove players that are no longer present
      Object.keys(otherPlayersRef.current).forEach(id => {
        if (!normalized.find(u => u.id === id)) {
          const spr = otherPlayersRef.current[id];
          spr && spr.destroy();
          delete otherPlayersRef.current[id];
        }
      });

      // add / update players
      normalized.forEach((u, idx) => {
        if (!u.id) return;
        // this is local player — initialize playerRef only once
        if (u.id === user._id || u.id === user.id) {
          if (!playerRef.current) {
            const spawnX = (typeof u.x === "number") ? u.x : 100;
            const spawnY = (typeof u.y === "number") ? u.y : 100;
            const self = sceneRef.current.physics.add.sprite(spawnX, spawnY, "player", 0);
            self.setCollideWorldBounds(true);
            self.body.setSize(16, 20);
            self.body.setOffset(8, 12);
            self.setDepth(10);
            if (collisionGroupRef.current) sceneRef.current.physics.add.collider(self, collisionGroupRef.current);
            Object.values(sceneRef.current.createdTileLayers || {}).forEach(tl => {
              if (tl && tl.layer) sceneRef.current.physics.add.collider(self, tl);
            });
            playerRef.current = self;
            sceneRef.current.cameras.main.startFollow(self);
          }
          return;
        }

        // remote player
        if (!otherPlayersRef.current[u.id]) {
          const spawnX = (typeof u.x === "number") ? u.x : 150 + idx * 40;
          const spawnY = (typeof u.y === "number") ? u.y : 120;
          const other = sceneRef.current.physics.add.sprite(spawnX, spawnY, "player", 0);
          other.setCollideWorldBounds(true);
          other.body.setSize(16,20);
          other.body.setOffset(8,12);
          other.setDepth(9);
          otherPlayersRef.current[u.id] = other;
        } else {
          // update position smoothly
          const other = otherPlayersRef.current[u.id];
          if (typeof u.x === "number" && typeof u.y === "number") {
            sceneRef.current.tweens.add({
              targets: other,
              x: u.x,
              y: u.y,
              duration: 50,
              ease: "Linear"
            });
          }
        }
      });
    }

    function handleMovePayload(payload) {
      // payload may be { userId, x, y } or { _id, x, y } or { userId:..., x:..., y:...}
      const id = payload?.userId || payload?._id || payload?.id;
      const x = payload?.x;
      const y = payload?.y;
      if (!id || id === user._id || id === user.id) return;
      const other = otherPlayersRef.current[id];
      if (other && typeof x === "number" && typeof y === "number") {
        sceneRef.current.tweens.add({
          targets: other,
          x,
          y,
          duration: 50,
          ease: "Linear"
        });
      }
    }

    phaserRef.current = new Phaser.Game(config);

    return () => {
      try { phaserRef.current && phaserRef.current.destroy(true); } catch (e) {}
      try { socket.off("onlineUsers", handleOnlineUsers); socket.off("move", handleMovePayload); socket.off("userMoved", handleMovePayload); } catch (e) {}
      otherPlayersRef.current = {};
      sceneRef.current = null;
      collisionGroupRef.current = null;
    };
  }, [socket, user, roomId]);

  return <div ref={gameRef} style={{ width: "100%", height: "100%", position: "relative" }} />;
};

export default MapGame;
