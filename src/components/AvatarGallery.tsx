import { avatarCategoryLabels, avatarOptions } from "../data/avatars";
import type { AvatarCategory } from "../types";
import AvatarPreview from "./AvatarPreview";

interface AvatarGalleryProps {
  selectedAvatarId: string;
  onSelect: (avatarId: string) => void;
}

const categories: AvatarCategory[] = ["bishoujo", "animal", "ikemen", "busho", "fantasy", "casual"];

export default function AvatarGallery({ selectedAvatarId, onSelect }: AvatarGalleryProps) {
  return (
    <div className="avatar-gallery">
      {categories.map((category) => (
        <section className="avatar-category" key={category}>
          <h3>{avatarCategoryLabels[category]}</h3>
          <div className="avatar-options">
            {avatarOptions
              .filter((avatar) => avatar.category === category)
              .map((avatar) => (
                <button
                  type="button"
                  className={`avatar-option ${selectedAvatarId === avatar.id ? "selected" : ""}`}
                  key={avatar.id}
                  onClick={() => onSelect(avatar.id)}
                >
                  <AvatarPreview avatar={avatar} size="small" />
                  <span>{avatar.name}</span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
