"use client";

export interface PaigeAvatarProps {
  compact?: boolean;
  listening: boolean;
  recording: boolean;
  thinking: boolean;
  speaking: boolean;
  mouthLevel: number;
}

export function PaigeAvatar({
  compact = false,
  listening,
  recording,
  thinking,
  speaking,
  mouthLevel,
}: PaigeAvatarProps) {
  const attentive = listening || recording;
  const mouthScale = speaking ? 0.35 + mouthLevel * 1.5 : 0.22;

  return (
    <div
      className={`paige-avatar ${compact ? "paige-avatar--compact" : ""}`}
      data-speaking={speaking || undefined}
      data-thinking={thinking || undefined}
      data-attentive={attentive || undefined}
      aria-label={`Paige avatar, ${
        speaking
          ? "speaking"
          : thinking
            ? "thinking"
            : recording
              ? "listening"
              : "idle"
      }`}
      role="img"
    >
      <div className="paige-avatar__glow" />
      <div className="paige-avatar__body">
        <div className="paige-avatar__blazer paige-avatar__blazer--left" />
        <div className="paige-avatar__blazer paige-avatar__blazer--right" />
        <div className="paige-avatar__shirt" />
        <div className="paige-avatar__neck" />
      </div>

      <div className="paige-avatar__head">
        <div className="paige-avatar__hair-back" />
        <div className="paige-avatar__ear paige-avatar__ear--left" />
        <div className="paige-avatar__ear paige-avatar__ear--right" />
        <div className="paige-avatar__face">
          <div className="paige-avatar__brow paige-avatar__brow--left" />
          <div className="paige-avatar__brow paige-avatar__brow--right" />
          <div className="paige-avatar__eye paige-avatar__eye--left">
            <span />
          </div>
          <div className="paige-avatar__eye paige-avatar__eye--right">
            <span />
          </div>
          <div className="paige-avatar__nose" />
          <div className="paige-avatar__cheek paige-avatar__cheek--left" />
          <div className="paige-avatar__cheek paige-avatar__cheek--right" />
          <div
            className="paige-avatar__mouth"
            style={{ transform: `translateX(-50%) scaleY(${mouthScale})` }}
          >
            <span />
          </div>
        </div>
        <div className="paige-avatar__hair-front paige-avatar__hair-front--left" />
        <div className="paige-avatar__hair-front paige-avatar__hair-front--right" />
        <div className="paige-avatar__bun" />
      </div>

      {!compact && (
        <div className="paige-avatar__presence" aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}
