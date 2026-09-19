export function PageHeader({ title, actions }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
