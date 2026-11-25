import { Link } from 'react-router-dom';
import '../css/MemberLink.css';

/**
 * MemberLink: Renders a member's name as a link to their CodeSphere public profile (/user/:username).
 * If no username is provided, falls back to plain text or id fallback.
 * Styling: Text decoration is none, no underline on hover.
 */
export default function MemberLink({ user, name, username, className = '', children, ...props }) {
  const targetUsername = username || user?.username || user?.id || user?._id;
  const displayName = children || name || user?.name || 'Member';

  if (!targetUsername) {
    return <span className={`member-profile-link-plain ${className}`} {...props}>{displayName}</span>;
  }

  return (
    <Link
      to={`/user/${encodeURIComponent(targetUsername)}`}
      className={`member-profile-link ${className}`}
      {...props}
    >
      {displayName}
    </Link>
  );
}
