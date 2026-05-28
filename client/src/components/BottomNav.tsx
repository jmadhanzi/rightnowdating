import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/live', label: 'Go Live', icon: '⚡' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/duo', label: 'Duo', icon: '🤝' },
  { to: '/chats', label: 'Chats', icon: '💬' },
  { to: '/profile', label: 'Profile', icon: '👤' },
] as const;

export default function BottomNav(): React.JSX.Element {
  return (
    <nav
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around"
      aria-label="Main navigation"
      style={{
        height: 'var(--nav-h)',
        background: 'rgba(14,14,14,0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--s3)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide"
          style={({ isActive }) => ({
            color: isActive ? item.to === '/duo' ? '#60a5fa' : 'var(--hot)' : 'var(--mt)',
          })}
        >
          {({ isActive }) => (
            <>
              <span
                className="flex items-center justify-center text-xl"
                style={
                  isActive
                    ? {
                        background: item.to === '/duo' ? 'rgba(96,165,250,0.12)' : 'rgba(255,92,0,0.12)',
                        border: `1px solid ${item.to === '/duo' ? 'rgba(96,165,250,0.3)' : 'rgba(255,92,0,0.25)'}`,
                        borderRadius: 12,
                        width: 36,
                        height: 32,
                      }
                    : {}
                }
              >
                {item.icon}
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
