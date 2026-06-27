import type { AvatarOption } from "../types";

interface AvatarPreviewProps {
  avatar: AvatarOption;
  size?: "tiny" | "small" | "large";
}

export default function AvatarPreview({ avatar, size = "large" }: AvatarPreviewProps) {
  if (avatar.imageSrc) {
    return <img className={`avatar-preview ${size}`} src={avatar.imageSrc} alt={avatar.name} draggable={false} />;
  }

  return (
    <svg className={`avatar-preview ${size}`} viewBox="0 0 140 140" role="img" aria-label={avatar.name}>
      <circle cx="70" cy="70" r="62" fill={avatar.accent} opacity="0.24" />
      {avatar.variant === "mage" && <path d="M34 44 L70 8 L106 44 Z" fill={avatar.outfit} />}
      {avatar.variant === "helmet" && <path d="M34 48 Q70 4 106 48 L94 62 Q70 42 46 62 Z" fill={avatar.accent} />}
      {avatar.variant === "ears" && (
        <>
          <path d="M38 46 L28 15 L58 34 Z" fill={avatar.hair} />
          <path d="M102 46 L112 15 L82 34 Z" fill={avatar.hair} />
        </>
      )}
      {avatar.variant === "cap" && <path d="M34 43 Q70 12 106 43 L98 54 Q70 43 42 54 Z" fill={avatar.accent} />}
      <path d="M34 118 Q70 82 106 118 Z" fill={avatar.outfit} />
      <circle cx="70" cy="64" r="34" fill={avatar.face} />
      <Hair avatar={avatar} />
      <circle cx="58" cy="67" r="3.5" fill="#17211c" />
      <circle cx="82" cy="67" r="3.5" fill="#17211c" />
      <path d="M59 82 Q70 91 82 82" stroke="#17211c" strokeWidth="4" fill="none" strokeLinecap="round" />
      {avatar.variant === "archer" && <path d="M102 44 Q122 70 102 100" stroke={avatar.accent} strokeWidth="5" fill="none" />}
      {avatar.variant === "hoodie" && <path d="M42 112 Q70 92 98 112 L90 126 L50 126 Z" fill={avatar.accent} opacity="0.65" />}
    </svg>
  );
}

function Hair({ avatar }: { avatar: AvatarOption }) {
  if (avatar.variant === "longHair") {
    return <path d="M35 62 Q38 22 70 24 Q103 22 106 63 Q104 98 86 113 Q92 78 70 45 Q48 78 54 113 Q36 97 35 62Z" fill={avatar.hair} />;
  }

  if (avatar.variant === "shortHair") {
    return <path d="M36 59 Q42 25 72 25 Q100 27 104 58 Q84 45 64 46 Q50 47 36 59Z" fill={avatar.hair} />;
  }

  if (avatar.variant === "helmet") {
    return <path d="M36 54 Q45 30 70 28 Q96 30 104 54 Q83 46 70 46 Q57 46 36 54Z" fill={avatar.hair} opacity="0.75" />;
  }

  if (avatar.variant === "mage") {
    return <path d="M38 58 Q45 25 70 27 Q96 25 103 58 Q78 47 61 49 Q49 50 38 58Z" fill={avatar.hair} />;
  }

  return <path d="M35 58 Q42 25 70 25 Q99 25 105 58 Q82 44 65 45 Q50 46 35 58Z" fill={avatar.hair} />;
}
