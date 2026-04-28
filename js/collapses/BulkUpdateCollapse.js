export const BulkUpdateCollapse = {
  mountId: 'bulk-update-collapse-mount',
  id: 'bulk-update-collapse',

  render() {
    // Já renderizado
    if (document.getElementById(this.id)) {
      return document.getElementById(this.id);
    }

    const mount = document.getElementById(this.mountId);
    if (!mount) {
      // Não é a página correta ou o mount ainda não existe.
      return null;
    }

    // HTML com acordeões para todas as categorias de campos
    const html = `
      <!-- Collapse de Alteração em Massa - VERSÃO EXPANDIDA (injetado via js/collapses/BulkUpdateCollapse.js) -->
      <div class="collapse mt-2" id="bulk-update-collapse">
        <div class="card border-0 shadow-sm" style="max-height: 80vh; overflow-y: auto;">
          <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center py-2 sticky-top">
            <h6 class="mb-0 fw-bold">
              <i class="bi bi-pencil-square me-1"></i>
              Alteração em Massa
            </h6>
            <button type="button" class="btn-close btn-close-white btn-sm" data-bs-toggle="collapse" data-bs-target="#bulk-update-collapse" aria-label="Fechar"></button>
          </div>
          <div class="card-body p-3">
            <form id="bulk-update-form">
              <!-- Campos Principais (sempre visíveis) -->
              <div class="row g-2 mb-3">
                <div class="col-md-4">
                  <label for="bulk-status" class="form-label small mb-1">
                    <i class="bi bi-diagram-3 text-primary me-1"></i>Status:
                  </label>
                  <select id="bulk-status" name="status" class="form-select form-select-sm"></select>
                </div>
                <div class="col-md-4">
                  <label for="bulk-analista" class="form-label small mb-1">
                    <i class="bi bi-person text-primary me-1"></i>Analista:
                  </label>
                  <select id="bulk-analista" class="form-select form-select-sm">
                    <option value="">-- Manter --</option>
                  </select>
                </div>
                <div class="col-md-4">
                  <label for="bulk-cartorio" class="form-label small mb-1">
                    <i class="bi bi-building text-primary me-1"></i>Cartório:
                  </label>
                  <select id="bulk-cartorio" class="form-select form-select-sm">
                    <option value="">-- Manter --</option>
                    <option value="1º RI LONDRINA">1º RI LONDRINA</option>
                    <option value="1º RI SÃO JOSÉ DOS PINHAIS">1º RI SÃO JOSÉ DOS PINHAIS</option>
                    <option value="2º RI SÃO JOSÉ DOS PINHAIS">2º RI SÃO JOSÉ DOS PINHAIS</option>
                    <option value="2º RI LONDRINA">2º RI LONDRINA</option>
                    <option value="1º RI CURITIBA">1º RI CURITIBA</option>
                    <option value="2º RI CURITIBA">2º RI CURITIBA</option>
                    <option value="3º RI CURITIBA">3º RI CURITIBA</option>
                    <option value="4º RI CURITIBA">4º RI CURITIBA</option>
                    <option value="5º RI CURITIBA">5º RI CURITIBA</option>
                    <option value="6º RI CURITIBA">6º RI CURITIBA</option>
                    <option value="7º RI CURITIBA">7º RI CURITIBA</option>
                    <option value="8º RI CURITIBA">8º RI CURITIBA</option>
                    <option value="9º RI CURITIBA">9º RI CURITIBA</option>
                    <option value="RI ARAUCARIA">RI ARAUCARIA</option>
                    <option value="RI CAMPO LARGO">RI CAMPO LARGO</option>
                    <option value="RI FAZ. RIO GRANDE">RI FAZ. RIO GRANDE</option>
                    <option value="RI PINHAIS">RI PINHAIS</option>
                    <option value="RI ALM.TAMANDARÉ">RI ALM.TAMANDARÉ</option>
                    <option value="RI COLOMBO">RI COLOMBO</option>
                    <option value="RI RIO NEGRO">RI RIO NEGRO</option>
                    <option value="RI MATINHOS">RI MATINHOS</option>
                    <option value="RI PONTAL DO PARANÁ">RI PONTAL DO PARANÁ</option>
                    <option value="RI PARANAGUA">RI PARANAGUA</option>
                    <option value="RI CACHOEIRINHA/RS">RI CACHOEIRINHA/RS</option>
                    <option value="3° RI PORTO ALEGRE">3° RI PORTO ALEGRE</option>
                    <option value="RI CAMPINA GRANDE DO SUL">RI CAMPINA GRANDE DO SUL</option>
                  </select>
                </div>
              </div>

              <!-- Acordeões para categorias de campos -->
              <div class="accordion accordion-flush mb-2" id="bulk-fields-accordion">

                <!-- Acordeão 1: Campos Select/Dropdown -->
                <div class="accordion-item border">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed py-2 small" type="button" data-bs-toggle="collapse" data-bs-target="#bulk-select-content" aria-expanded="false">
                      <i class="bi bi-ui-checks text-primary me-2"></i>
                      Campos de Seleção (16 campos)
                    </button>
                  </h2>
                  <div id="bulk-select-content" class="accordion-collapse collapse" data-bs-parent="#bulk-fields-accordion">
                    <div class="accordion-body p-2">
                      <div class="row g-2">
                        <!-- Workflow e Analista CEHOP -->
                        <div class="col-md-3">
                          <label for="bulk-workflowId" class="form-label small mb-1">Workflow:</label>
                          <select id="bulk-workflowId" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-analistaCehop" class="form-label small mb-1">Analista CEHOP:</label>
                          <select id="bulk-analistaCehop" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-tipoImovel" class="form-label small mb-1">Tipo Imóvel:</label>
                          <select id="bulk-tipoImovel" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="urbano">Urbano</option>
                            <option value="rural">Rural</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-renda" class="form-label small mb-1">Renda:</label>
                          <select id="bulk-renda" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="E-social">E-social</option>
                            <option value="FORMAL">FORMAL</option>
                            <option value="Imposto de Renda">Imposto de Renda</option>
                            <option value="INFORMAL">INFORMAL</option>
                            <option value="MISTA">MISTA</option>
                            <option value="PRO-LABORE">PRO-LABORE</option>
                          </select>
                        </div>
                        <!-- Validação, FGTS, Casa Fácil, Certificadora -->
                        <div class="col-md-3">
                          <label for="bulk-validacao" class="form-label small mb-1">Validação:</label>
                          <select id="bulk-validacao" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Validada">Validada</option>
                            <option value="Não validada">Não validada</option>
                            <option value="Enviado para validação">Enviado para validação</option>
                            <option value="Não se aplica">Não se aplica</option>
                            <option value="Doc Pendente">Doc Pendente</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-fgts" class="form-label small mb-1">FGTS:</label>
                          <select id="bulk-fgts" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="true">Sim</option>
                            <option value="false">Não</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-casaFacil" class="form-label small mb-1">Casa Fácil:</label>
                          <select id="bulk-casaFacil" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="true">Sim</option>
                            <option value="false">Não</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-certificadora" class="form-label small mb-1">Certificadora:</label>
                          <select id="bulk-certificadora" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="BrasilCertec">BrasilCertec</option>
                            <option value="BrasilCertec/Parceiro">BrasilCertec/Parceiro</option>
                            <option value="BrasilCertec/Finanville">BrasilCertec/Finanville</option>
                            <option value="Finanville">Finanville</option>
                            <option value="Manual">Manual</option>
                            <option value="Parceiro">Parceiro</option>
                            <option value="GOV">GOV</option>
                          </select>
                        </div>
                        <!-- SEHAB, Pesquisas, Montagem Complementar, Montagem CEHOP -->
                        <div class="col-md-3">
                          <label for="bulk-sehab" class="form-label small mb-1">SEHAB:</label>
                          <select id="bulk-sehab" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Conferencia Inicial">Conferência Inicial</option>
                            <option value="Ag Liberação Lyx">Aguardando Liberação LYX</option>
                            <option value="Cadastro Errado">Cadastro Errado</option>
                            <option value="Espelho anexo">Espelho Anexo</option>
                            <option value="CCS aprovada">CCS Aprovada</option>
                            <option value="Ag Comp. Endereço">Aguardando Comprovante de Endereço</option>
                            <option value="Sem cadastro">Sem Cadastro</option>
                            <option value="RG Vencido">RG Vencido</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-pesquisas" class="form-label small mb-1">Pesquisas:</label>
                          <select id="bulk-pesquisas" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="OK">OK</option>
                            <option value="Serasa">Serasa</option>
                            <option value="CND">CND</option>
                            <option value="CND e Serasa">CND e Serasa</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-montagemComplementar" class="form-label small mb-1">Mont. Complementar:</label>
                          <select id="bulk-montagemComplementar" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Não">Não</option>
                            <option value="Iniciado">Iniciado</option>
                            <option value="Finalizado">Finalizado</option>
                            <option value="Aguard. Doc">Aguard. Doc</option>
                            <option value="Validar renda">Validar renda</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-montagemCehop" class="form-label small mb-1">Mont. CEHOP:</label>
                          <select id="bulk-montagemCehop" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Não">Não</option>
                            <option value="Iniciado">Iniciado</option>
                            <option value="Finalizado">Finalizado</option>
                            <option value="Aguard. Doc">Aguard. Doc</option>
                            <option value="Validar renda">Validar renda</option>
                          </select>
                        </div>
                        <!-- Pré Entrevista, Certidão, Declaração, Produto -->
                        <div class="col-md-3">
                          <label for="bulk-preEntrevista" class="form-label small mb-1">Pré Entrevista:</label>
                          <select id="bulk-preEntrevista" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Realizada">Realizada</option>
                            <option value="Pendente ligação">Pendente ligação</option>
                            <option value="Não passou">Não passou</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-certidaoAtualizada" class="form-label small mb-1">Certidão Atualizada:</label>
                          <select id="bulk-certidaoAtualizada" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Solicitado">Solicitado</option>
                            <option value="Entregue">Entregue</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-declaracaoEstadoCivil" class="form-label small mb-1">Decl. Estado Civil:</label>
                          <select id="bulk-declaracaoEstadoCivil" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="Solicitado">Solicitado</option>
                            <option value="Entregue">Entregue</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-produto" class="form-label small mb-1">Produto:</label>
                          <select id="bulk-produto" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="CCA">CCA</option>
                            <option value="Agencia">Agencia</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Acordeão 2: Campos de Texto -->
                <div class="accordion-item border">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed py-2 small" type="button" data-bs-toggle="collapse" data-bs-target="#bulk-text-content" aria-expanded="false">
                      <i class="bi bi-fonts text-primary me-2"></i>
                      Campos de Texto (21 campos)
                    </button>
                  </h2>
                  <div id="bulk-text-content" class="accordion-collapse collapse" data-bs-parent="#bulk-fields-accordion">
                    <div class="accordion-body p-2">
                      <div class="row g-2">
                        <!-- Vendedor, Empreendimento, Apto, Bloco -->
                        <div class="col-md-3">
                          <label for="bulk-vendedorConstrutora" class="form-label small mb-1">Vendedor/Construtora:</label>
                          <input type="text" id="bulk-vendedorConstrutora" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-empreendimento" class="form-label small mb-1">Empreendimento:</label>
                          <input type="text" id="bulk-empreendimento" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-apto" class="form-label small mb-1">Apartamento:</label>
                          <input type="text" id="bulk-apto" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-bloco" class="form-label small mb-1">Bloco:</label>
                          <input type="text" id="bulk-bloco" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <!-- Agência, Gerente, Imobiliária, Corretor -->
                        <div class="col-md-3">
                          <label for="bulk-agencia" class="form-label small mb-1">Agência:</label>
                          <input type="text" id="bulk-agencia" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-gerente" class="form-label small mb-1">Gerente:</label>
                          <input type="text" id="bulk-gerente" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-imobiliaria" class="form-label small mb-1">Imobiliária:</label>
                          <input type="text" id="bulk-imobiliaria" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-corretor" class="form-label small mb-1">Corretor:</label>
                          <input type="text" id="bulk-corretor" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <!-- Contrato, IPTU, Protocolo, Forma Pgto -->
                        <div class="col-md-3">
                          <label for="bulk-nContratoCEF" class="form-label small mb-1">Nº Contrato CEF:</label>
                          <input type="text" id="bulk-nContratoCEF" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-codigoCCA" class="form-label small mb-1">Código CCA:</label>
                          <input type="text" id="bulk-codigoCCA" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-tipoConsulta" class="form-label small mb-1">Tipo de Consulta:</label>
                          <select id="bulk-tipoConsulta" class="form-select form-select-sm">
                            <option value="">-- Manter --</option>
                            <option value="PR">PR</option>
                            <option value="CP">CP</option>
                            <option value="GR">GR</option>
                            <option value="RV">RV</option>
                            <option value="MI">MI</option>
                          </select>
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-iptu" class="form-label small mb-1">IPTU:</label>
                          <input type="text" id="bulk-iptu" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-protocoloRi" class="form-label small mb-1">Protocolo RI:</label>
                          <input type="text" id="bulk-protocoloRi" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-formaPagamentoRi" class="form-label small mb-1">Forma Pgto RI:</label>
                          <input type="text" id="bulk-formaPagamentoRi" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <!-- Dados do Imóvel -->
                        <div class="col-md-6">
                          <label for="bulk-enderecoImovel" class="form-label small mb-1">Endereço Imóvel:</label>
                          <input type="text" id="bulk-enderecoImovel" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-cidadeImovel" class="form-label small mb-1">Cidade:</label>
                          <input type="text" id="bulk-cidadeImovel" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-ufImovel" class="form-label small mb-1">UF:</label>
                          <input type="text" id="bulk-ufImovel" class="form-control form-control-sm" maxlength="2" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-cepImovel" class="form-label small mb-1">CEP:</label>
                          <input type="text" id="bulk-cepImovel" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-inscricaoImobiliaria" class="form-label small mb-1">Inscrição Imobiliária:</label>
                          <input type="text" id="bulk-inscricaoImobiliaria" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-matriculaImovel" class="form-label small mb-1">Matrícula RI:</label>
                          <input type="text" id="bulk-matriculaImovel" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-faltaFinalizar" class="form-label small mb-1">Falta Finalizar:</label>
                          <input type="text" id="bulk-faltaFinalizar" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-6">
                          <label for="bulk-documentacaoRepasse" class="form-label small mb-1">Doc./Repasse (Obs.):</label>
                          <input type="text" id="bulk-documentacaoRepasse" class="form-control form-control-sm" placeholder="-- Manter --">
                        </div>
                        <div class="col-12">
                          <div class="form-text">
                            Ao informar Código CCA e/ou Tipo de Consulta, a chave será regerada automaticamente para cada processo selecionado.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Acordeão 3: Campos Numéricos -->
                <div class="accordion-item border">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed py-2 small" type="button" data-bs-toggle="collapse" data-bs-target="#bulk-numeric-content" aria-expanded="false">
                      <i class="bi bi-currency-dollar text-primary me-2"></i>
                      Campos Numéricos (8 campos)
                    </button>
                  </h2>
                  <div id="bulk-numeric-content" class="accordion-collapse collapse" data-bs-parent="#bulk-fields-accordion">
                    <div class="accordion-body p-2">
                      <div class="row g-2">
                        <div class="col-md-3">
                          <label for="bulk-valorITBI" class="form-label small mb-1">Valor ITBI (R$):</label>
                          <input type="number" id="bulk-valorITBI" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-valorFunrejus" class="form-label small mb-1">Valor Funrejus (R$):</label>
                          <input type="number" id="bulk-valorFunrejus" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-valorFinalRi" class="form-label small mb-1">Valor Final RI (R$):</label>
                          <input type="number" id="bulk-valorFinalRi" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-valorContratoBanco" class="form-label small mb-1">Valor Contrato Banco (R$):</label>
                          <input type="number" id="bulk-valorContratoBanco" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-valorDespachante" class="form-label small mb-1">Valor Despachante (R$):</label>
                          <input type="number" id="bulk-valorDespachante" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-valorDepositoRi" class="form-label small mb-1">Valor Depósito RI (R$):</label>
                          <input type="number" id="bulk-valorDepositoRi" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-areaTerreno" class="form-label small mb-1">Área Terreno (m²):</label>
                          <input type="number" id="bulk-areaTerreno" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                        <div class="col-md-3">
                          <label for="bulk-areaConstruida" class="form-label small mb-1">Área Construída (m²):</label>
                          <input type="number" id="bulk-areaConstruida" class="form-control form-control-sm" step="0.01" placeholder="-- Manter --">
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Acordeão 4: Campos de Data -->
                <div class="accordion-item border">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed py-2 small" type="button" data-bs-toggle="collapse" data-bs-target="#bulk-dates-content" aria-expanded="false">
                      <i class="bi bi-calendar-event text-primary me-2"></i>
                      Campos de Data (46 campos)
                    </button>
                  </h2>
                  <div id="bulk-dates-content" class="accordion-collapse collapse" data-bs-parent="#bulk-fields-accordion">
                    <div class="accordion-body p-2">
                      <div class="row g-2" id="bulk-date-fields">
                        <!-- Campos de data serão inseridos dinamicamente aqui -->
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <button type="submit" class="btn btn-primary btn-sm w-100">
                <i class="bi bi-check-circle me-1"></i>
                Aplicar Alterações
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    mount.insertAdjacentHTML('beforeend', html);
    return document.getElementById(this.id);
  },
};
