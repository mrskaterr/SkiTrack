import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Room state: roomName -> { password, users: { socketId -> { lat, lng, name } } }
  const rooms = new Map<string, any>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomName, password, userName, isCreating }) => {
      try {
        if (!roomName || !password || !userName) {
          socket.emit("error", "Missing required fields");
          return;
        }

        let room = rooms.get(roomName);

        if (isCreating) {
          if (room) {
            socket.emit("error", "Room already exists");
            return;
          }
          room = { password, users: new Map() };
          rooms.set(roomName, room);
        } else {
          if (!room) {
            socket.emit("error", "Room does not exist");
            return;
          }
          if (room.password !== password) {
            socket.emit("error", "Invalid password");
            return;
          }
        }

        // Join the socket room
        socket.join(roomName);
        
        // Add user to state
        room.users.set(socket.id, { name: userName, lat: 0, lng: 0 });
        
        socket.emit("joined-room", { roomName });
        
        // Notify others in the room
        const usersList = Array.from(room.users.entries()).map(([id, data]: [string, any]) => ({
          id,
          ...data
        }));
        io.to(roomName).emit("room-users", usersList);
      } catch (err) {
        console.error("Join room error:", err);
        socket.emit("error", "Internal server error");
      }
    });

    socket.on("update-location", ({ roomName, lat, lng }) => {
      const room = rooms.get(roomName);
      if (room && room.users.has(socket.id)) {
        const userData = room.users.get(socket.id);
        userData.lat = lat;
        userData.lng = lng;
        
        // Broadcast to everyone in the room except sender
        socket.to(roomName).emit("user-location-update", {
          id: socket.id,
          lat,
          lng
        });
      }
    });

    const handleLeave = () => {
      rooms.forEach((room, roomName) => {
        if (room.users.has(socket.id)) {
          room.users.delete(socket.id);
          io.to(roomName).emit("user-left", socket.id);
          
          // Clean up empty rooms
          if (room.users.size === 0) {
            rooms.delete(roomName);
          }
        }
      });
    };

    socket.on("leave-room", handleLeave);
    socket.on("disconnect", handleLeave);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
