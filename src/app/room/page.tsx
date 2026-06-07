import RoomClient from "./RoomClient";

// LiveKit handles the human participant tiles and voice transport. Paige's
// browser-side copilot panel listens, retrieves, answers, and speaks over it.
export default function RoomPage() {
  return <RoomClient />;
}
