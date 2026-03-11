'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          fontFamily: 'ui-monospace, monospace',
          color: '#e5e5e5',
        }}
      >
        <div style={{ maxWidth: 480, width: '100%', padding: '0 24px' }}>
          <div
            style={{
              border: '2px solid #991b1b',
              padding: 32,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: '#ef4444',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'pulse 2s infinite',
                }}
              />
              <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#ef4444', textTransform: 'uppercase' }}>
                CRITICAL SYSTEM FAILURE
              </span>
            </div>

            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Fatal Error
            </h1>

            <div
              style={{
                border: '1px solid #333',
                padding: 12,
                fontSize: 11,
                color: '#a3a3a3',
                wordBreak: 'break-all',
              }}
            >
              <div style={{ fontSize: 9, letterSpacing: '0.1em', color: '#666', marginBottom: 6, textTransform: 'uppercase' }}>
                Error Output
              </div>
              {error.message || 'The application encountered an unrecoverable error.'}
              {error.digest && (
                <div style={{ marginTop: 8, fontSize: 9, color: '#555' }}>
                  digest: {error.digest}
                </div>
              )}
            </div>

            <pre
              style={{
                fontSize: 10,
                color: '#666',
                margin: 0,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
{`> process exited with code 1
> attempting recovery...
> awaiting user input_`}
            </pre>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={reset}
                style={{
                  flex: 1,
                  height: 40,
                  border: '2px solid #e5e5e5',
                  background: '#e5e5e5',
                  color: '#0a0a0a',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                }}
              >
                RETRY
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  flex: 1,
                  height: 40,
                  border: '2px solid #e5e5e5',
                  background: 'transparent',
                  color: '#e5e5e5',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  letterSpacing: '0.05em',
                }}
              >
                RETURN HOME
              </a>
            </div>
          </div>

          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
        </div>
      </body>
    </html>
  );
}
