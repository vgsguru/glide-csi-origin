/**
 * The Glide brand assets.
 *
 * The source artwork is transparent-backed, so the white variant is used on
 * dark surfaces and the black variant on light ones. `Logo` renders just the
 * G mark (for nav bars and avatars); `LogoLockup` renders mark + wordmark.
 */
export default function Logo({ theme = 'dark', size = 26, className = '' }) {
  const src = theme === 'dark' ? '/logo_white_mark.png' : '/logo_black_mark.png';
  return (
    <img
      src={src}
      alt="Glide"
      style={{ height: size, width: size }}
      className={`object-contain select-none ${className}`}
      draggable={false}
    />
  );
}

export function LogoLockup({ theme = 'dark', width = 150, className = '' }) {
  const src = theme === 'dark' ? '/logo_white_lockup.png' : '/logo_black_lockup.png';
  return (
    <img
      src={src}
      alt="Glide"
      style={{ width }}
      className={`object-contain select-none ${className}`}
      draggable={false}
    />
  );
}
