import { environmentTone } from "../format.ts";

export function EnvironmentLabel({ name, label = name }: { name: string; label?: string }) {
  return <span className={`env ${environmentTone(name)}`}>{label}</span>;
}

export function EnvironmentList({ names }: { names: string[] }) {
  return (
    <div className="envs">
      {names.map((name) => (
        <EnvironmentLabel key={name} name={name} />
      ))}
    </div>
  );
}
