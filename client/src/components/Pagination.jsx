export default function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1
  );
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {nums.map((n, i) => (
        <span key={n}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
          <button
            className={`btn btn-sm ${n === page ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
          >
            {n}
          </button>
        </span>
      ))}
      <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</button>
    </nav>
  );
}
