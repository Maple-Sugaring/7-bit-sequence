export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
      <h1>{title}</h1>
      {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
