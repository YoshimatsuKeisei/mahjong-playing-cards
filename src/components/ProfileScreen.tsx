import { useState } from "react";
import { getAvatarById } from "../data/avatars";
import type { ProfileData } from "../types";
import AvatarGallery from "./AvatarGallery";
import AvatarPreview from "./AvatarPreview";

interface ProfileScreenProps {
  profile: ProfileData;
  onSave: (profile: ProfileData) => void;
  onBackHome: () => void;
}

export default function ProfileScreen({ profile, onSave, onBackHome }: ProfileScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftProfile, setDraftProfile] = useState(profile);
  const visibleProfile = isEditing ? draftProfile : profile;
  const avatar = getAvatarById(visibleProfile.avatarId);

  function startEditing() {
    setDraftProfile(profile);
    setIsEditing(true);
  }

  function saveProfile() {
    onSave({
      userName: draftProfile.userName.trim() || "Guest Player",
      comment: draftProfile.comment.trim() || "よろしくお願いします。",
      avatarId: draftProfile.avatarId,
    });
    setIsEditing(false);
  }

  function cancelEditing() {
    setDraftProfile(profile);
    setIsEditing(false);
  }

  return (
    <main className="screen profile-screen">
      <section className="profile-panel">
        <button type="button" className="profile-edit-button" onClick={isEditing ? cancelEditing : startEditing}>
          ✎ {isEditing ? "Cancel" : "Edit"}
        </button>
        <p className="eyebrow">Player Profile</p>
        <h1>Profile</h1>

        <div className="profile-card">
          <AvatarPreview avatar={avatar} />
          {!isEditing ? (
            <div className="profile-display">
              <h2>{profile.userName}</h2>
              <p>{profile.comment}</p>
            </div>
          ) : (
            <div className="profile-editor">
              <label>
                user name
                <input
                  value={draftProfile.userName}
                  maxLength={24}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, userName: event.target.value }))}
                />
              </label>
              <label>
                一言コメント
                <textarea
                  value={draftProfile.comment}
                  maxLength={80}
                  rows={3}
                  onChange={(event) => setDraftProfile((current) => ({ ...current, comment: event.target.value }))}
                />
              </label>
            </div>
          )}
        </div>

        {isEditing && (
          <>
            <AvatarGallery
              selectedAvatarId={draftProfile.avatarId}
              onSelect={(avatarId) => setDraftProfile((current) => ({ ...current, avatarId }))}
            />
            <div className="profile-actions">
              <button type="button" onClick={cancelEditing}>
                キャンセル
              </button>
              <button type="button" className="primary-button" onClick={saveProfile}>
                保存
              </button>
            </div>
          </>
        )}

        {!isEditing && (
          <button type="button" className="primary-button" onClick={onBackHome}>
            Home
          </button>
        )}
      </section>
    </main>
  );
}
