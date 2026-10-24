import { Icon } from './Workspace';

export function getPaginationRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (current >= total - 3) return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions: number[];
  sizeSelectId: string;
  sizeSelectLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions,
  sizeSelectId,
  sizeSelectLabel,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  return (
    <footer className="planning-pagination-bar">
      <div className="pagination-summary">
        <span>
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} de <strong>{totalItems}</strong>
        </span>
      </div>

      <nav className="pagination-pages-nav" aria-label="Páginas">
        <button
          type="button"
          className="pagination-arrow-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label="Página anterior"
          title="Página anterior"
        >
          <Icon path="M15 19l-7-7 7-7" />
        </button>

        {getPaginationRange(page, totalPages).map((pageItem, index) =>
          pageItem === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={pageItem}
              type="button"
              className={'pagination-number-btn' + (pageItem === page ? ' is-active' : '')}
              onClick={() => onPageChange(pageItem)}
              aria-label={`Página ${pageItem}`}
              aria-current={pageItem === page ? 'page' : undefined}
            >
              {pageItem}
            </button>
          )
        )}

        <button
          type="button"
          className="pagination-arrow-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label="Página siguiente"
          title="Página siguiente"
        >
          <Icon path="M9 5l7 7-7 7" />
        </button>
      </nav>

      <div className="pagination-size-container">
        <select
          id={sizeSelectId}
          className="pagination-pagesize-select"
          value={pageSize}
          onChange={event => onPageSizeChange(Number(event.target.value))}
          aria-label={sizeSelectLabel}
        >
          {pageSizeOptions.map(option => (
            <option key={option} value={option}>
              {option} / pág
            </option>
          ))}
        </select>
      </div>
    </footer>
  );
}
