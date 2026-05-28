import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/live',    label: 'Go Live',  icon: '⚡', color: 'var(--hot)' },
  { to: '/map',     label: 'Map',      icon: '🗺️',  color: 'var(--hot)' },
  { to: '/duo',     label: 'Duo',      icon: '🤝', color: '#60a5fa'   },
  { to: '/chats',   label: 'Chats',    icon: '💬', color: 'var(--hot)' },
  { to: '/profile', label: 'Profile',  icon: '👤', color: 'var(--hot)' },
] as const;

export default function BottomNav(): React.JSX.Element {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around"
      style={{
        height:             'var(--nav-h)',
        paddingBottom:      'env(safe-area-inset-bottom)',
        minHeight:          'calc(var(--nav-h) + env(safe-area-inset-bottom))',
        background:         'rgba(14,14,14,0.97)',
        backdropFilter:     'blur(20px)',
        borderTop:          '0.5px solid var(--s3)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          aria-label={item.label}
          className="flex flex-1 flex-col items-center justify-center py-2 text-[10px] font-bold uppercase tracking-wide"
          style={({ isActive }) => ({ color: isActive ? item.color : 'var(--mt)' })}
        >
          {({ isActive }) => (
            <>
              {/* Active state: filled pill behind icon — not just a thin line */}
              <span
                className="flex items-center justify-center text-xl"
                aria-current={isActive ? 'page' : undefined}
                style={
                  isActive
                    ? {
                        background:   `${item.color}18`,
                        border:       `0.5px solid ${item.color}40`,
                        borderRadius: 12,
                        width:        36,
                        height:       32,
                        marginBottom: 2,
                        transition:   'all 0.15s',
                        // Minimum 44px touch target via padding on parent flex item
                      }
                    : { marginBottom: 2 }
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
