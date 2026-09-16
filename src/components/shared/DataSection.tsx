/**
 * Bloco rotulado da tela de detalhe — cabeçalho em versalete, corpo livre e um
 * canto para a ação da seção.
 *
 * Nasceu dentro de `ClienteDetailPage` e saiu para cá quando a segunda tela
 * precisou do mesmo enquadramento: manter a definição lá obrigaria quem a
 * reaproveita a importar de um componente de página, o que fecharia um ciclo
 * de import entre irmãos.
 */
export function DataSection({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h3 className="text-[11px] font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  )
}
