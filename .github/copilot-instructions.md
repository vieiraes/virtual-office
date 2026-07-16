# Instruções do Copilot — Virtual Office

## Análise antes do diagnóstico

Para **qualquer demanda** — implementação, refatoração, bug, arquitetura, infra, UX, etc. —
sempre faça uma **análise Socrática** antes de apresentar o diagnóstico final ou iniciar a execução.

### O que é a análise Socrática aqui

A análise deve questionar as premissas da demanda antes de assumir que a solução óbvia é a correta.
Pergunte (e responda) pelo menos:

1. **O que realmente está sendo pedido?** — separe o pedido literal da necessidade real.
2. **O que assumimos que é verdade e pode não ser?** — identifique premissas implícitas.
3. **Qual é o custo/risco da abordagem mais óbvia?** — tecnicamente, de manutenção, de negócio.
4. **Existe uma solução mais simples ou mais adequada ao contexto?** — princípio da navalha de Occam.
5. **O que pode dar errado com cada caminho?** — antecipe falhas antes de agir.

Só depois da análise apresente o diagnóstico final e, se for o caso, execute a solução.

### Formato esperado

```
## 🔍 Análise Socrática

**1. O que está sendo pedido de fato?** ...
**2. Premissas implícitas:** ...
**3. Custo/risco da abordagem óbvia:** ...
**4. Alternativas mais simples:** ...
**5. O que pode dar errado:** ...

---
## ✅ Diagnóstico / Plano de ação
...
```

> A análise pode ser breve para demandas simples, mas **nunca deve ser pulada**.
