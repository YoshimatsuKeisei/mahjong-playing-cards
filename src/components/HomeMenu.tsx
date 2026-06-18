export type HomeMenuTarget =
  | "newGame"
  | "moreGame"
  | "settings"
  | "manual"
  | "profile";

interface HomeMenuProps {
  disabled?: boolean;
  onSelect: (target: HomeMenuTarget) => void;
}

const menuItems: Array<{
  target: HomeMenuTarget;
  label: string;
  imageSrc: string;
}> = [
  {
    target: "newGame",
    label: "New Game",
    imageSrc: new URL("../../new-game-button.png?v=home-ui-transparent-2", import.meta.url).href,
  },
  {
    target: "moreGame",
    label: "More Game",
    imageSrc: new URL("../../more-game-button.png?v=home-ui-transparent-2", import.meta.url).href,
  },
  {
    target: "settings",
    label: "Setting",
    imageSrc: new URL("../../settings-button.png?v=home-ui-transparent-2", import.meta.url).href,
  },
  {
    target: "manual",
    label: "Manual",
    imageSrc: new URL("../../manual-button.png?v=home-ui-transparent-2", import.meta.url).href,
  },
  {
    target: "profile",
    label: "Profile",
    imageSrc: new URL("../../profile-button.png?v=home-ui-transparent-2", import.meta.url).href,
  },
];

export default function HomeMenu({ disabled = false, onSelect }: HomeMenuProps) {
  return (
    <nav className="home-menu" aria-label="ホームメニュー">
      {menuItems.map((item) => (
        <button
          type="button"
          className="home-menu-button"
          data-testid={`home-menu-${item.target}`}
          disabled={disabled}
          key={item.target}
          aria-label={item.label}
          onClick={() => onSelect(item.target)}
        >
          <img src={item.imageSrc} alt="" aria-hidden="true" draggable={false} />
        </button>
      ))}
    </nav>
  );
}
