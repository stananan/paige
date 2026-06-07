import RoomClient from "./RoomClient";

// The hardcoded 3-person meeting room: you + a friend + Paige (agent participant,
// wired next). LiveKit handles the room, video tiles, and voice transport.
export default function RoomPage() {
  return <RoomClient />;
}
