import React from "react";
import "./Breadcrumb.css";

function Breadcrumb({ items = [] }) {
  return (
    <nav className="breadcrumb" aria-label="Navegación">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="breadcrumb__separator">›</span>
          )}

          {item.link ? (
            <a href={item.link} className="breadcrumb__link">
              {item.label}
            </a>
          ) : (
            <span className="breadcrumb__current">
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export default Breadcrumb;