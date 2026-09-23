import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [{ title: "Política de Privacidade — DirectFlow" }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidade — DirectFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">Última atualização: 23 de setembro de 2026.</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. O que é o DirectFlow</h2>
          <p className="text-sm text-muted-foreground">
            O DirectFlow é uma ferramenta de automação de vendas via Instagram: quando alguém comenta uma
            palavra-chave num post da conta do cliente, o sistema responde automaticamente por mensagem direta
            (Direct) e pode continuar a conversa por um fluxo configurado pelo próprio cliente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. Quais dados coletamos</h2>
          <p className="text-sm text-muted-foreground">Coletamos e processamos:</p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Dados de cadastro do cliente (nome da empresa, nome, email) — usados só pra login e identificação da conta.</li>
            <li>
              O token de acesso à API do Instagram do cliente, obtido via login oficial do Instagram, usado
              exclusivamente pra enviar mensagens e ler comentários em nome da própria conta do cliente.
            </li>
            <li>
              Dados de quem interage com a conta do Instagram do cliente: identificador e nome de usuário do
              Instagram de quem comenta ou manda mensagem, o texto do comentário ou da mensagem, e o histórico da
              conversa dentro do fluxo configurado.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">3. Como usamos esses dados</h2>
          <p className="text-sm text-muted-foreground">
            Usamos esses dados exclusivamente pra operar o funil configurado pelo cliente: identificar comentários
            que batem com uma palavra-chave, enviar a mensagem automática correspondente, e acompanhar em qual
            etapa do fluxo cada pessoa está. Quando o cliente opcionalmente configura uma classificação de
            resposta por IA, o texto da mensagem recebida é enviado à API da OpenAI só pra essa classificação — não
            enviamos dados de perfil ou identificação da pessoa nessa chamada.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">4. Compartilhamento com terceiros</h2>
          <p className="text-sm text-muted-foreground">
            Não vendemos nem compartilhamos esses dados com terceiros além do necessário pra operar o serviço: a
            própria Meta/Instagram (pra enviar e receber as mensagens) e, só quando o cliente ativa essa opção, a
            OpenAI (pra classificação de texto, como descrito acima).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">5. Retenção e segurança</h2>
          <p className="text-sm text-muted-foreground">
            Os dados ficam armazenados enquanto a conta do cliente estiver ativa. Senhas são guardadas com hash
            (nunca em texto puro) e toda comunicação com o sistema acontece via HTTPS.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">6. Seus direitos</h2>
          <p className="text-sm text-muted-foreground">
            Você pode pedir a exclusão dos seus dados (cadastro ou dados de interações) a qualquer momento entrando
            em contato pelo email abaixo. Desconectar a conta do Instagram (botão "Desconectar" na tela de Conexão)
            interrompe imediatamente qualquer novo processamento de mensagens.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">7. Contato</h2>
          <p className="text-sm text-muted-foreground">
            Dúvidas sobre esta política ou pedidos relacionados aos seus dados: <a className="underline underline-offset-2 hover:text-foreground" href="mailto:triadcompanyy@gmail.com">triadcompanyy@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
