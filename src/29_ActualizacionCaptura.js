/** Actualización V4: mismo registro de captura, PACIENTES y EVENTOS. */
var CAPTURA_EDICION_CAMPOS = ['RUT','NOMBRE','SEXO','FECHA_NACIMIENTO','TELEFONOS','TELEFONO_OBS','SECTOR','ESTADO','FECHA_INGRESO','PREINGRESO','DUPLA_INGRESO','PROFESIONAL_SEGUIMIENTO','CONDICIONES','OTRAS_PATOLOGIAS','PROXIMO_CONTROL','COMPOSICION_CONTROL','OBSERVACIONES','SALUD_MENTAL'];
var CAPTURA_EDICION_FECHAS = ['FECHA_NACIMIENTO','FECHA_INGRESO','PROXIMO_CONTROL'];
var CAPTURA_CORRECCION_PREFIJO = 'CORRECCION_FECHA_V4:';

function Captura_edicionTexto_(p, campo) {
  var v = p[campo];
  return v instanceof Date ? Control_aIso(v) : Utl_texto(v);
}
function Captura_jsonOrdenado_(v) {
  if (Array.isArray(v)) return '[' + v.map(Captura_jsonOrdenado_).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+Captura_jsonOrdenado_(v[k]);}).join(',') + '}';
  return JSON.stringify(v);
}
/** Valida toda la edición ANTES de cualquier escritura. */
function Captura_validarEdicion_(a) {
  function fallo(msg) { return {ok:false,motivo:msg}; }
  if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(function(k){return ['id','rutOriginal','campos','atenciones'].indexOf(k)<0;})) return fallo('Edición inválida');
  if (typeof a.id !== 'string' || !a.id || a.id.length>150 || typeof a.rutOriginal !== 'string') return fallo('Cargue primero la ficha');
  if (!a.campos || typeof a.campos !== 'object' || Array.isArray(a.campos)) return fallo('Campos inválidos');
  if (!Array.isArray(a.atenciones) || a.atenciones.length>2) return fallo('Atenciones inválidas');
  var out={id:a.id,rutOriginal:a.rutOriginal,campos:{},atenciones:[]};
  var keys=Object.keys(a.campos).sort();
  for(var i=0;i<keys.length;i++) {
    var k=keys[i],c=a.campos[k];
    if(CAPTURA_EDICION_CAMPOS.indexOf(k)<0 || !c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).sort().join(',')!=='anterior,valor' || typeof c.anterior!=='string' || typeof c.valor!=='string') return fallo('Campo no editable: '+k);
    var v=c.valor.trim();
    if(v.length>5000 || c.anterior.length>5000) return fallo('Texto demasiado largo: '+k);
    if(['RUT','NOMBRE','SECTOR'].indexOf(k)>=0 && !v) return fallo('No puede vaciar '+k);
    if(k==='RUT') {var r=Norm_normalizarRut(v);if(r.estado!=='OK')return fallo('RUT inválido');v=r.rut;}
    if(k==='SEXO' && ['', 'M','F','OTRO'].indexOf(v)<0)return fallo('Sexo inválido');
    if(k==='SALUD_MENTAL' && ['','SI','NO'].indexOf(v)<0)return fallo('Solo SI, NO o vacío (sin información)');
    if(k==='SECTOR' && ['AMARILLO','NARANJO','VERDE'].indexOf(v)<0)return fallo('Sector inválido');
    if(k==='ESTADO' && !v)v='PENDIENTE';
    if(k==='ESTADO' && v && ESTADOS.VALIDOS.indexOf(v)<0)return fallo('Estado inválido');
    if(CAPTURA_EDICION_FECHAS.indexOf(k)>=0 && v) {
      var d=Captura_v2_validarIsoFecha(v,{min:k==='FECHA_NACIMIENTO'?1900:2015,max:2040});
      if(!d.ok)return fallo('Fecha inválida: '+k);v=d.iso;
    }
    if(k==='PREINGRESO' && v) {
      var pre=v.toUpperCase().replace(/\s+/g,'_');
      if(['NO_APLICA','PENDIENTE'].indexOf(pre)>=0)v=pre;
      else {
        var dp=Captura_v2_validarIsoFecha(v,{min:2015,max:2040});
        if(!dp.ok)return fallo('Preingreso: use fecha ISO, NO_APLICA o PENDIENTE');
        v=dp.iso;
      }
    }
    if(k==='TELEFONOS')v=Norm_normalizarTelefono(v).telefonos.join('/');
    if(k==='FECHA_NACIMIENTO' && v && v>Captura_v2_fechaOperacion({}))return fallo('Nacimiento no puede estar en el futuro');
    if(k==='CONDICIONES') {
      var cond=Norm_normalizarCondiciones(v,CATALOGO_CONDICIONES_ECICEP);
      if(cond.noReconocidas.length)return fallo('Patología fuera de catálogo');
      v=cond.detectadas.map(function(x){return typeof x==='string'?x:x.CODIGO||x.codigo;}).filter(Boolean).sort().join(';');
    }
    out.campos[k]={anterior:c.anterior,valor:v};
  }
  var tipos={};
  for(var j=0;j<a.atenciones.length;j++) {
    var e=a.atenciones[j];
    if(!e || Object.keys(e).sort().join(',')!=='anterior,fecha,idEvento,modo,tipo' || Object.keys(e).some(function(k){return typeof e[k]!=='string';}) || ['CONTROL','SEGUIMIENTO'].indexOf(e.tipo)<0 || tipos[e.tipo] || ['REGISTRAR','CORREGIR'].indexOf(e.modo)<0) return fallo('Atención inválida');
    tipos[e.tipo]=true;
    if(!Captura_v2_validarIsoFecha(e.fecha,{min:2015,max:2040}).ok)return fallo('Fecha de atención inválida');
    if(e.modo==='CORREGIR' && (!e.idEvento || !Captura_v2_validarIsoFecha(e.anterior,{min:2015,max:2040}).ok))return fallo('Seleccione la atención que desea corregir');
    out.atenciones.push({tipo:e.tipo,modo:e.modo,fecha:e.fecha,idEvento:e.idEvento,anterior:e.anterior});
  }
  if(!keys.length && !out.atenciones.length)return fallo('No hay cambios para guardar');
  out.atenciones.sort(function(a,b){return a.tipo.localeCompare(b.tipo);});
  return {ok:true,valor:out};
}

/** Ficha accesible con sesión activa o enlace compartido válido. */
function WebApp_cargarPacienteEdicion(rut,acceso) {
  if(!WebApp_autorizarBuscador(acceso))return {ok:false,motivo:'Enlace de Captura no válido. Solicita el QR actualizado.'};
  var nr=Norm_normalizarRut(rut);
  if(nr.estado!=='OK')return {ok:false,motivo:'RUT inválido'};
  var lista=Modelo_leerPacientes().filter(function(p){return Norm_normalizarRut(p.RUT).rut===nr.rut;});
  if(lista.length!==1)return {ok:false,motivo:lista.length?'RUT duplicado: requiere revisión antes de editar.':'Paciente no encontrado'};
  var p=lista[0],campos={};
  CAPTURA_EDICION_CAMPOS.forEach(function(k){campos[k]=Captura_edicionTexto_(p,k);});
  var ultimos={};
  Modelo_leerEventos().filter(function(e){return e.ID_INTERNO===p.ID_INTERNO && ['CONTROL','SEGUIMIENTO'].indexOf(e.TIPO_EVENTO)>=0;}).forEach(function(e){
    var f=Control_aIso(e.FECHA_EVENTO),anterior=ultimos[e.TIPO_EVENTO];
    if(f && (!anterior || f>=anterior.fecha))ultimos[e.TIPO_EVENTO]={idEvento:Utl_texto(e.ID_EVENTO),fecha:f};
  });
  return {ok:true,id:p.ID_INTERNO,rutOriginal:nr.rut,campos:campos,ultimos:ultimos,
    ultimoControl:Control_aIso(p.ULTIMO_CONTROL),ultimoSeguimiento:Control_aIso(p.ULTIMO_SEGUIMIENTO),estratificacion:Utl_texto(p.ESTRATIFICACION),
    condiciones:CATALOGO_CONDICIONES_ECICEP.filter(function(c){return c.ACTIVA;}).map(function(c){return {codigo:c.CODIGO,nombre:c.NOMBRE_CANONICO};})};
}

/** Aplica correcciones auditadas al leer; EVENTOS físico sigue append-only.
 * Nunca altera los objetos originales ni acepta correcciones entre pacientes. */
function Captura_eventosVigentes_(eventos) {
  if (!eventos.some(function(e){return e.TIPO_EVENTO==='OTRO'&&Utl_texto(e.DESCRIPCION).indexOf(CAPTURA_CORRECCION_PREFIJO)===0;})) return eventos;
  var salida=eventos.map(function(e){return Object.assign({},e);}),porId={};
  salida.forEach(function(e){porId[e.ID_EVENTO]=e;});
  salida.forEach(function(e){
    if(e.TIPO_EVENTO!=='OTRO' || Utl_texto(e.DESCRIPCION).indexOf(CAPTURA_CORRECCION_PREFIJO)!==0 || !/^FORM\|Cp4-/.test(Utl_texto(e.FUENTE)))return;
    try {
      var c=JSON.parse(e.DESCRIPCION.slice(CAPTURA_CORRECCION_PREFIJO.length)),dest=porId[c.idEvento];
      if(dest && dest.ID_INTERNO===e.ID_INTERNO && ['CONTROL','SEGUIMIENTO'].indexOf(dest.TIPO_EVENTO)>=0 && Control_aIso(dest.FECHA_EVENTO)===c.anterior && Captura_v2_validarIsoFecha(c.fecha,{min:2015,max:2040}).ok)dest.FECHA_EVENTO=c.fecha;
    }catch(err){/* Una nota ajena nunca cambia el historial. */}
  });
  return salida;
}

/** Tras importar fuentes, restaura las cachés afectadas por correcciones V4.
 * La fecha efectiva se calcula desde EVENTOS; la agenda manual no se toca. */
function Captura_reconciliarFechasCorregidas_() {
  if (!Modelo_hayCorreccionesFecha_()) return {ok:true,actualizados:0};
  var eventos=Modelo_leerEventos(),porEvento={},afectados={};
  eventos.forEach(function(e){porEvento[Utl_texto(e.ID_EVENTO)]=e;});
  eventos.forEach(function(e){
    if(e.TIPO_EVENTO!=='OTRO' || !/^FORM\|Cp4-/.test(Utl_texto(e.FUENTE)) || Utl_texto(e.DESCRIPCION).indexOf(CAPTURA_CORRECCION_PREFIJO)!==0)return;
    try {
      var c=JSON.parse(e.DESCRIPCION.slice(CAPTURA_CORRECCION_PREFIJO.length)),dest=porEvento[c.idEvento];
      if(dest && dest.ID_INTERNO===e.ID_INTERNO && ['CONTROL','SEGUIMIENTO'].indexOf(dest.TIPO_EVENTO)>=0)afectados[dest.ID_INTERNO+'|'+dest.TIPO_EVENTO]=true;
    }catch(err){/* Una nota inválida no modifica cachés. */}
  });
  if(!Object.keys(afectados).length)return {ok:true,actualizados:0};
  var fechas={};
  eventos.forEach(function(e){
    var clave=e.ID_INTERNO+'|'+e.TIPO_EVENTO,fecha=Control_aIso(e.FECHA_EVENTO);
    if(afectados[clave] && fecha && (!fechas[clave] || fecha>fechas[clave]))fechas[clave]=fecha;
  });
  var cambios=0,hoja=Modelo_hoja(HOJAS.PACIENTES);
  Modelo_leerPacientes().forEach(function(p,idx){
    var nuevo=null;
    ['CONTROL','SEGUIMIENTO'].forEach(function(tipo){
      var clave=p.ID_INTERNO+'|'+tipo,campo=tipo==='CONTROL'?'ULTIMO_CONTROL':'ULTIMO_SEGUIMIENTO';
      if(!afectados[clave])return;
      var fecha=fechas[clave]||'';
      if(Control_aIso(p[campo])===fecha)return;
      if(!nuevo)nuevo=Object.assign({},p);
      nuevo[campo]=fecha;
    });
    if(!nuevo)return;
    nuevo.FECHA_ACTUALIZACION=new Date();
    hoja.getRange(Modelo_filaFisica(HOJAS.PACIENTES,idx),1,1,MODELO_PACIENTE.length).setValues([Modelo_filaDesdeObjeto(nuevo)]);
    cambios++;
  });
  if(cambios)Modelo_invalidarLecturas();
  return {ok:true,actualizados:cambios};
}

/** Entrega V4 bajo el mismo ScriptLock/registro de captura que V2/V3.
 *  La edición ya está autorizada (WebApp_capturarEnviar + opciones.usuario) y
 *  bajo lock: usa la capa de dominio directamente (nunca un wrapper api_* ni
 *  una re-autorización). §40-§42. */
function Captura_aplicarCamposDominio_(idInterno, campos) {
  return Paciente_aplicarCampos_(idInterno, campos, { fuente: 'CAPTURA_V4' });
}

function Captura_entregarEdicion_(norm,marca,opciones) {
  var a=norm.actualizacion,encontrado=Modelo_buscarPaciente(a.id);
  function fail(m){return {estado:'ERROR',motivo:m,idInterno:a.id,idEvento:''};}
  if(!opciones.usuario || a.rutOriginal!==norm.rut)return fail('NO_AUTORIZADO_O_IDENTIDAD_INVALIDA');
  if(!encontrado)return fail('PACIENTE_NO_ENCONTRADO');
  var p=encontrado.obj,fin=Captura_v2_marcaEnEventos(marca);
  if(fin && fin.idEvento)return {estado:'PROCESADO',idInterno:a.id,idEvento:fin.idEvento};
  var rutNuevo=a.campos.RUT&&a.campos.RUT.valor;
  if(Norm_normalizarRut(p.RUT).rut!==a.rutOriginal && Norm_normalizarRut(p.RUT).rut!==rutNuevo)return fail('FICHA_CAMBIO: vuelva a cargar el paciente');
  var campos={},keys=Object.keys(a.campos);
  for(var i=0;i<keys.length;i++) {
    var k=keys[i],par=a.campos[k],actual=Captura_edicionTexto_(p,k);
    if(actual!==par.anterior && actual!==par.valor)return fail('FICHA_CAMBIO: '+k+' fue modificado; recargue la ficha');
    campos[k]=par.valor;
  }
  if(rutNuevo && Modelo_leerPacientes().some(function(q){return q.ID_INTERNO!==a.id && Norm_normalizarRut(q.RUT).rut===rutNuevo;}))return fail('RUT_YA_EXISTE');
  var eventos=Modelo_leerEventos(),hoy=Captura_v2_fechaOperacion({});
  for(var j=0;j<a.atenciones.length;j++) {
    var at=a.atenciones[j];
    if(at.fecha>hoy)return fail('La atención no puede estar en el futuro; use Próximo control / seguimiento');
    if(at.modo==='CORREGIR') {
      var destino=eventos.filter(function(e){return e.ID_EVENTO===at.idEvento && e.ID_INTERNO===a.id && e.TIPO_EVENTO===at.tipo;})[0];
      var masNueva=eventos.filter(function(e){return e.ID_INTERNO===a.id&&e.TIPO_EVENTO===at.tipo;}).sort(function(x,y){return Control_aIso(x.FECHA_EVENTO)<Control_aIso(y.FECHA_EVENTO)?1:-1;})[0];
      if(!destino || !masNueva || masNueva.ID_EVENTO!==destino.ID_EVENTO || (Control_aIso(destino.FECHA_EVENTO)!==at.anterior && Control_aIso(destino.FECHA_EVENTO)!==at.fecha))return fail('ATENCION_CAMBIO: vuelva a cargar la ficha');
    }
  }
  var esquema=Modelo_asegurarEsquemaPacientes_();
  if(!esquema.ok)return fail('ESQUEMA_PACIENTES_INCOMPATIBLE');
  var codigos=Object.prototype.hasOwnProperty.call(campos,'CONDICIONES')?campos.CONDICIONES.split(';').filter(Boolean):null;
  if(codigos!==null)delete campos.CONDICIONES;
  if(Object.keys(campos).length) {var upd=Captura_aplicarCamposDominio_(a.id,campos);if(!upd.ok)return fail(upd.motivo||'ACTUALIZACION_FALLIDA');}
  if(codigos!==null) {
    var otras=Object.prototype.hasOwnProperty.call(campos,'OTRAS_PATOLOGIAS')?campos.OTRAS_PATOLOGIAS:Captura_edicionTexto_(p,'OTRAS_PATOLOGIAS');
    var pat=Patologias_guardarPaciente_(a.id,codigos,otras);
    if(!pat.ok)return fail(pat.motivo||'PATOLOGIAS_NO_GUARDADAS');
    Modelo_invalidarLecturas();
  }
  for(var z=0;z<a.atenciones.length;z++) {
    var ac=a.atenciones[z],submarca=marca+'|ATENCION|'+ac.tipo;
    if(!Captura_v2_marcaEnEventos(submarca)) {
      var r=Eventos_registrarPaciente_({idInterno:a.id,tipoEvento:ac.modo==='CORREGIR'?'OTRO':ac.tipo,fecha:ac.modo==='CORREGIR'?hoy:ac.fecha,
        profesional:norm.profesional,fuente:submarca,registradoPor:opciones.usuario,
        descripcion:ac.modo==='CORREGIR'?CAPTURA_CORRECCION_PREFIJO+JSON.stringify({idEvento:ac.idEvento,anterior:ac.anterior,fecha:ac.fecha}):'ATENCION_VIA_ACTUALIZACION',observaciones:norm.observaciones||''},{fuenteTransporte:'CapturaV4'});
      if(!r.ok)return fail(r.motivo||'ATENCION_NO_GUARDADA');
    }
  }
  if(a.atenciones.length) {
    Modelo_invalidarLecturas();var actualP=Modelo_buscarPaciente(a.id),nuevo=Object.assign({},actualP.obj),vigentes=Modelo_leerEventos();
    a.atenciones.forEach(function(ac){var fechas=vigentes.filter(function(e){return e.ID_INTERNO===a.id&&e.TIPO_EVENTO===ac.tipo;}).map(function(e){return Control_aIso(e.FECHA_EVENTO);}).filter(Boolean).sort();nuevo[ac.tipo==='CONTROL'?'ULTIMO_CONTROL':'ULTIMO_SEGUIMIENTO']=fechas.length?fechas[fechas.length-1]:'';});
    nuevo.FECHA_ACTUALIZACION=new Date();Modelo_hoja(HOJAS.PACIENTES).getRange(Modelo_filaFisica(HOJAS.PACIENTES,actualP.idx),1,1,MODELO_PACIENTE.length).setValues([Modelo_filaDesdeObjeto(nuevo)]);Modelo_invalidarLecturas();
    Modelo_refrescarVistasSectores_();
  }
  var audit=Eventos_registrarPaciente_({idInterno:a.id,tipoEvento:'OTRO',fecha:hoy,profesional:norm.profesional,fuente:marca,registradoPor:opciones.usuario,descripcion:'ACTUALIZACION_FICHA_V4: '+keys.join(', '),observaciones:norm.observaciones||''},{fuenteTransporte:'CapturaV4'});
  if(!audit.ok)return fail(audit.motivo||'AUDITORIA_NO_GUARDADA');
  var guardado=Captura_v2_marcaEnEventos(marca);
  return {estado:'PROCESADO',idInterno:a.id,idEvento:guardado&&guardado.idEvento||''};
}
