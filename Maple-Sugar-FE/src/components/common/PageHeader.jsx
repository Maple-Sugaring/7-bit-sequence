export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
