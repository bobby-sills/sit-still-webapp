type Stat = { label: string; value: string }

export function Stats({ items }: { items: Stat[] }) {
  return (
    <div className="stats">
      {items.map((stat) => (
        <div className="stat" key={stat.label}>
          <div className="stat__label">{stat.label}</div>
          <div className="stat__value">{stat.value}</div>
        </div>
      ))}
    </div>
  )
}
