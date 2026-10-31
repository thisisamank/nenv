import { avatarTone, initials } from "../format.ts";

export function Avatar({ email }: { email: string }) {
  return (
    <span className={`avatar a${avatarTone(email)}`} title={email}>
      {initials(email)}
    </span>
  );
}

export function AvatarStack({ emails, max = 3 }: { emails: string[]; max?: number }) {
  const extra = emails.length - max;
  return (
    <div className="stack">
      {emails.slice(0, max).map((email) => (
        <Avatar key={email} email={email} />
      ))}
      {extra > 0 && <span className="avatar more">+{extra}</span>}
    </div>
  );
}
