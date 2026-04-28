// seedVendors.js - Inserção opcional de vendors base (Restaurado 2025-09-20)
// Executa somente se admin logado e flag global não setada previamente. Use window.__SEED_VENDORS__=true para forçar.
// OTIMIZADO 27/11/2025: Não invalida cache desnecessariamente

import { createOrUpdateVendor, getAllVendors, addEmpreendimentoToVendor, addBlocoToEmpreendimento, addApartamento } from './firestoreService.js';

let pendingSeedPromise = null;

async function ensureSeed(){
  if (pendingSeedPromise) {
    return pendingSeedPromise;
  }

  pendingSeedPromise = (async () => {
  try {
    const user = window.currentUserAuth || (await window.getCurrentUserAuth?.());
    if(!user){ if(window.__DEBUG__) console.log('[seedVendors] Usuário não autenticado; abortando'); return; }
    const token = await user.getIdTokenResult();
    const isAdmin = token.claims?.admin === true;
    if(!isAdmin){ if(window.__DEBUG__) console.log('[seedVendors] Usuário não admin; abortando'); return; }
    if(window.__VENDORS_SEEDED__ && !window.__SEED_VENDORS__){
      if(window.__DEBUG__) console.log('[seedVendors] Já seedado nesta sessão');
      return;
    }
    // OTIMIZADO: Usar cache normal, não forçar refresh (economiza leitura Firestore)
    const existing = await getAllVendors();
    if(existing.length && !window.__SEED_VENDORS__){
      console.log('[seedVendors] Vendors já existentes; não inserindo base');
      window.__VENDORS_SEEDED__=true; return;
    }

    if(window.__DEBUG__) console.log('[seedVendors] Inserindo base de vendors');

    const base = [
      { name:'Construtora Alfa', cnpj:null, empreendimentos:[ { nome:'Residencial Sol', blocos:[ { nome:'Bloco A', apartamentos:['101','102','201']}, { nome:'Bloco B', apartamentos:['103','104'] } ] } ] },
      { name:'Construtora Beta', cnpj:null, empreendimentos:[ { nome:'Villa Azul', blocos:[ { nome:'Torre 1', apartamentos:['11','12'] } ] } ] }
    ];

    for(const v of base){
      const res = await createOrUpdateVendor({ name: v.name, cnpj: v.cnpj, active:true });
      // Add empreendimentos/blocos/apartamentos
      for(const emp of v.empreendimentos){
        await addEmpreendimentoToVendor(res.id, emp.nome);
        const vendorReload = (await getAllVendors({ forceRefresh:true })).find(x=>x.id===res.id);
        const empCreated = vendorReload.empreendimentos.find(e=> e.nome===emp.nome);
        for(const bloco of emp.blocos){
          await addBlocoToEmpreendimento(res.id, empCreated.id, bloco.nome);
          const vendorReload2 = (await getAllVendors({ forceRefresh:true })).find(x=>x.id===res.id);
          const empAgain = vendorReload2.empreendimentos.find(e=> e.nome===emp.nome);
          const blocoCreated = empAgain.blocos.find(b=> b.nome===bloco.nome);
          for(const apto of bloco.apartamentos){
            await addApartamento(res.id, empAgain.id, blocoCreated.id, apto);
          }
        }
      }
    }
    window.__VENDORS_SEEDED__=true;
    if(window.__DEBUG__) console.log('[seedVendors] Base inserida.');
  } catch (err){
    console.error('Seed vendors falhou', err);
  }
  })().finally(() => {
    pendingSeedPromise = null;
  });

  return pendingSeedPromise;
}

window.__SEED_VENDORS_RUN__ = ensureSeed;
window.ensureSeedVendors = ensureSeed;
