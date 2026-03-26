import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io(
            process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
            {
                autoConnect: true,
                reconnection: true,
                reconnectionDelay: 2000,
            }
        );
    }
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};