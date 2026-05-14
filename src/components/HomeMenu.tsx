export type HomeMenuTarget = "newGame" | "moreGame" | "settings" | "manual" | "profile";

interface HomeMenuProps {
  disabled?: boolean;
  onSelect: (target: HomeMenuTarget) => void;
}

const menuItems: Array<{ target: HomeMenuTarget; label: string }> = [
  { target: "newGame", label: "New Game" },
  { target: "moreGame", label: "More Game" },
  { target: "settings", label: "Setting" },
  { target: "manual", label: "Manual" },
  { target: "profile", label: "Profile" },
];

export default function HomeMenu({ disabled = false, onSelect }: HomeMenuProps) {
  return (
    <nav className="home-menu" aria-label="ホームメニュー">
      {menuItems.map((item) => (
        <button
          type="button"
          className="home-menu-button"
          disabled={disabled}
          key={item.target}
          onClick={() => onSelect(item.target)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
