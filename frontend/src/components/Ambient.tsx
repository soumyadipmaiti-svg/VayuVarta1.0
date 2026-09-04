export default function Ambient() {
  return (
    <div className="ambient-aurora">
      <div
        className="aurora-blob"
        style={{
          width: 600, height: 600, top: '-10%', left: '-5%',
          background: 'radial-gradient(circle, rgba(61,156,255,0.3), rgba(43,127,224,0.08), transparent)',
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: 500, height: 500, top: '40%', right: '-10%',
          background: 'radial-gradient(circle, rgba(125,184,232,0.2), rgba(61,156,255,0.06), transparent)',
          animationDelay: '-6s',
        }}
      />
      <div
        className="aurora-blob"
        style={{
          width: 400, height: 400, bottom: '-5%', left: '30%',
          background: 'radial-gradient(circle, rgba(61,156,255,0.15), rgba(125,184,232,0.05), transparent)',
          animationDelay: '-12s',
        }}
      />
    </div>
  );
}
