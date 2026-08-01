/* ==== 工程日程表 共通エンジン ====
   各工程の日程表フォルダ内の全ファイル（DE/SU/支給/外注/OMI/OGS/GS/LA/MI/JG/EW/GC/EM/DR/WEL/3D/FIN/NCM/熱処理/ｶﾅｯｸ/ﾆｭｰｶﾅｯｸ/PN）で共有するロジック。
   各HTMLファイルは <script src="_procGanttEngine.js"></script> のあと ProcGantt.init({code, color, ...}) を呼ぶだけ。

   考え方：
   ・この日程表はデータを直接入力する場所ではなく、部品表（sakaeIS_buhinhyoMock_v1_＜品番＞）を横断的にスキャンして、
     指定した工程コードが付いたジョブ（部品×工程）を自動的に拾ってくる「ビュー」。
   ・社内No／客先／型式名／納期／品名／数量／工程は部品表の該当データをそのまま表示（このページでは編集不可）。
   ・前工程／次工程／工程完了期限は、その部品のprocesses[]を日付順に並べたときの「1つ前／1つ後」から自動算出する
     （工程完了期限＝次工程の予定日）。
   ・工数だけは部品表にまだ項目が無く、実績か見積か未確認のため、このページ内だけのローカル項目として仮に入力できるようにしてある。
   ・バーをドラッグすると、その工程の予定日（部品表のprocesses[].date/ampm）へ直接書き戻される（個別日程表・NC日程表と同じ方式）。
*/
window.ProcGantt = (function(){

  function esc(s){
    return (s==null?'':s).toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function init(config){
    const CODE = config.code;
    const COLOR = config.color || '#173a68';
    // ---- 個別日程表からダブルクリックで来た場合はその品番の個別日程表に戻れるようにする（URLの?productNoで判定） ----
    const ctxProductNo = (new URLSearchParams(location.search).get('productNo')||'').trim();
    const BACK_LINK = config.backLink || (ctxProductNo ? ('../個別日程表_モック.html?productNo='+encodeURIComponent(ctxProductNo)) : '../残品表_モック.html');
    const BACK_LABEL = config.backLabel || (ctxProductNo ? '← 個別日程表へ' : '← 工程別残品表へ');

    document.title = CODE + '日程表｜MIKOSHIYA SEIKI-iS';
    const brandEl = document.querySelector('.topbar .brand');
    if(brandEl) brandEl.innerHTML = '<span class="sakae">MIKOSHIYA SEIKI</span><span class="is">-iS</span>';
    const pageNameEl = document.getElementById('pageName');
    if(pageNameEl) pageNameEl.textContent = CODE + '日程表（工程ごとの日程表：共通エンジン／部品表とリンク）';
    const backLinkEl = document.getElementById('backLink');
    if(backLinkEl){ backLinkEl.href = BACK_LINK; backLinkEl.textContent = BACK_LABEL; }
    const noteBarEl = document.getElementById('noteBar');
    if(noteBarEl){
      noteBarEl.innerHTML =
        'これは「工程ごとの日程表」を全工程で使い回す共通エンジンによる '+esc(CODE)+' 用のページです。行は直接入力するのではなく、部品表（各品番）に登録された工程のうち「'+esc(CODE)+'」が付いているものを自動的に拾ってきます。<br>'
        + '社内No～数量・工程は部品表の内容をそのまま表示（このページでは編集不可）。前工程・次工程・工程完了期限はその部品の工程一覧を日付順に並べて自動算出しています（工程完了期限＝次工程の予定日）。工数だけはまだ部品表に項目が無いため、実績か見積か確認が取れるまでこのページだけの仮入力にしてあります。<br>'
        + 'バーの中央をドラッグすると日付が、両端をつまんで伸縮すると日数（作業期間）が変わります。いずれも部品表側に一緒に反映されます（🔗マーク付き）。日付未設定の工程は下の「未日程」欄から日付を決めてください。';
    }
    const legendEl = document.getElementById('legend');
    if(legendEl){
      legendEl.innerHTML =
        '<span class="lgItem"><span class="lgSwatch" style="background:'+COLOR+';"></span>'+esc(CODE)+'工程</span>'
        + '<span class="lgHint">行＝部品表と自動リンクしたジョブ（このページでは工数以外は編集不可）</span>';
    }
    // ---- 期限超過／期限間近のサマリーチップ（残品表_モック.htmlと同じ考え方）。薄いHTML側には無い要素なのでここで作って差し込む ----
    let summaryRowEl = document.getElementById('summaryRow');
    if(!summaryRowEl && legendEl){
      summaryRowEl = document.createElement('div');
      summaryRowEl.id = 'summaryRow';
      summaryRowEl.className = 'summaryRow';
      legendEl.insertAdjacentElement('afterend', summaryRowEl);
    }

    function uid(){ return Math.random().toString(36).slice(2,9); }

    // ---- 自由配置メモ（吹き出し）の描画。render()のたびにganttInnerへ子要素として追加し直す（重複防止のため一旦全部消してから作り直す） ----
    function renderMemoLayer(){
      ganttInner.querySelectorAll('.memoNote').forEach(el=> el.remove());
      memos.forEach(memo=>{
        const el = document.createElement('div');
        el.className = 'memoNote';
        el.dataset.memoId = memo.id;
        el.style.left = memo.x+'px';
        el.style.top = memo.y+'px';
        el.style.width = memo.w+'px';
        el.style.height = memo.h+'px';
        el.innerHTML = '<div class="memoNoteHandle" data-role="memoHandle" title="ドラッグで移動">・・・</div>'
          + '<textarea class="memoNoteBody" data-role="memoBody" placeholder="メモを入力">'+esc(memo.text||'')+'</textarea>'
          + '<div class="memoNoteResize" data-role="memoResize" title="ドラッグでサイズ変更"></div>';
        ganttInner.appendChild(el);
      });
    }

    // ---- 項目定義（実物のMI日程表Excelの列に合わせてある。減らす場合は榮製機に確認してから） ----
    const COLS = [
      { key:'no', label:'社内No', width:92 },
      { key:'customer', label:'客先', width:64 },
      { key:'model', label:'型式名', width:150 },
      { key:'dueDate', label:'納期', width:54 },
      { key:'itemName', label:'品名', width:170 },
      { key:'qty', label:'数量', width:40 },
      { key:'process', label:'工程', width:52 },
      { key:'manHour', label:'工数', width:50, editable:true },
      { key:'completeDeadline', label:'工程完了期限', width:78 },
      { key:'prevProcess', label:'前工程', width:52 },
      { key:'completeSchedule', label:'完了予定', width:64 },
      { key:'nextProcess', label:'次工程', width:52 },
    ];
    const SIDE_W = COLS.reduce((a,c)=>a+c.width,0);

    // ---- 表示期間：1/2/3ヶ月表示トグルはやめて、開始日・終了日を自由に指定できるようにしてある。
    // 初期表示（および「初期表示に戻す」）は、このコード（CODE）の全バーの開始日（一番早い工程日から日数ぶん手前）～終了日（一番遅い工程日）に自動フィットする。
    // 該当データがまだ無ければ今日から1ヶ月を初期表示にする。
    // 工程日は「開始」ではなく「終了（納期）」を表すため、実際にバーが始まる位置は工程日から日数（コマ数）ぶん手前になる。
    // 万一の日付入力ミス等で表示期間が異常に広くならないよう、最大でも1年分（MAX_RANGE_DAYS）に収める。 ----
    const TODAY_DATE = new Date();
    function parseDateStr(s){
      if(!s) return null;
      const p = String(s).split('-').map(Number);
      if(p.length!==3 || !p[0] || !p[1] || !p[2]) return null;
      return new Date(p[0], p[1]-1, p[2]);
    }
    function fmtShort(dateStr, ampm){
      const d = parseDateStr(dateStr);
      if(!d) return '';
      return (d.getMonth()+1)+'/'+d.getDate() + (ampm ? (ampm==='PM'?'午後':'午前') : '');
    }
    // ---- 工程完了期限の遅れ判定（残品表_モック.htmlと同じ考え方：今日との差で期限超過／期限間近を出す） ----
    const TODAY_MID = new Date(TODAY_DATE.getFullYear(), TODAY_DATE.getMonth(), TODAY_DATE.getDate());
    function daysUntil(dateStr){
      const d = parseDateStr(dateStr);
      if(!d) return null;
      return Math.round((d - TODAY_MID)/86400000);
    }

    function fmtDateForInput(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
    const MAX_RANGE_DAYS = 365;
    function computeDefaultView(){
      let minDate = null, maxDate = null;
      scanJobs().forEach(j=>{
        const d = parseDateStr(j.date);
        if(!d) return;
        const halfSpan = Math.max(0, (j.days || 3) - 1);
        const effectiveStart = new Date(d);
        effectiveStart.setDate(effectiveStart.getDate() - Math.ceil(halfSpan / 2));
        if(!minDate || effectiveStart < minDate) minDate = effectiveStart;
        if(!maxDate || d > maxDate) maxDate = d;
      });
      if(!minDate || !maxDate){
        const start = new Date(TODAY_DATE.getFullYear(), TODAY_DATE.getMonth(), TODAY_DATE.getDate());
        const end = new Date(start);
        end.setMonth(end.getMonth()+1);
        end.setDate(end.getDate()-1);
        return { start, end };
      }
      const start = new Date(minDate);
      start.setDate(start.getDate()-3);
      let end = new Date(maxDate);
      end.setDate(end.getDate()+3);
      const maxEnd = new Date(start);
      maxEnd.setDate(maxEnd.getDate()+MAX_RANGE_DAYS-1);
      if(end > maxEnd) end = maxEnd;
      return { start, end };
    }
    const STORAGE_PREFIX = 'sakaeIS_procGanttMock_' + CODE + '_v1';
    const VIEW_KEY = STORAGE_PREFIX + '_view';
    function loadView(){
      try{
        const raw = localStorage.getItem(VIEW_KEY);
        if(raw){
          const v = JSON.parse(raw);
          const s = parseDateStr(v.start), e = parseDateStr(v.end);
          if(s && e && e>=s) return { start:s, end:e };
        }
      }catch(err){}
      return computeDefaultView();
    }
    function saveView(){ localStorage.setItem(VIEW_KEY, JSON.stringify({ start: fmtDateForInput(viewStart), end: fmtDateForInput(viewEnd) })); }
    let { start: viewStart, end: viewEnd } = loadView();
    let RANGE_START = viewStart;
    function idxForDate(date){ return Math.round((date - RANGE_START)/86400000) + 1; }
    function dateForIdx(idx){ const d = new Date(RANGE_START); d.setDate(RANGE_START.getDate() + (idx-1)); return d; }
    function todayIdx(){ return idxForDate(TODAY_DATE); }
    function halfIdxForDate(date, isPM){ return (idxForDate(date)-1)*2 + (isPM?2:1); }
    function dateForHalfIdx(hIdx){ const dayIdx = Math.floor((hIdx-1)/2)+1; return { date: dateForIdx(dayIdx), isPM: (hIdx-1)%2===1 }; }

    function getMonthSegments(){
      const segs = [];
      const total = currentUnitCount();
      let idx = 1;
      let cursorY = RANGE_START.getFullYear(), cursorM = RANGE_START.getMonth();
      let dayInMonthStart = RANGE_START.getDate();
      let remaining = total;
      while(remaining > 0){
        const daysInMonth = new Date(cursorY, cursorM+1, 0).getDate();
        const daysThisSeg = Math.min(remaining, daysInMonth - dayInMonthStart + 1);
        segs.push({ label:(cursorM+1)+'月', days:daysThisSeg, startIdx:idx });
        idx += daysThisSeg;
        remaining -= daysThisSeg;
        dayInMonthStart = 1;
        cursorM++;
        if(cursorM>11){ cursorM=0; cursorY++; }
      }
      return segs;
    }
    function currentUnitCount(){ return Math.max(1, Math.round((viewEnd - RANGE_START)/86400000) + 1); }

    // ---- 工数・メモなど、部品表にまだ項目が無いローカル追加情報（procId単位、全工程共通で1つの保存領域を共有） ----
    const EXTRA_KEY = 'sakaeIS_procGanttMock_extra_v1';
    function loadExtra(){
      try{ const raw = localStorage.getItem(EXTRA_KEY); if(raw) return JSON.parse(raw); }catch(e){}
      return {};
    }
    function saveExtra(){ localStorage.setItem(EXTRA_KEY, JSON.stringify(extra)); }
    let extra = loadExtra();

    // ---- 自由配置・自由サイズのメモ（吹き出し）。日付・工程・バーには一切紐付かず、ガント表内の好きな座標に置ける付箋（コードごとに保存） ----
    const MEMO_KEY = STORAGE_PREFIX + '_memos';
    function loadMemos(){
      try{ const raw = localStorage.getItem(MEMO_KEY); if(raw) return JSON.parse(raw); }catch(e){}
      return [];
    }
    function saveMemos(){ localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); }
    let memos = loadMemos();

    // ---- 部品表を横断スキャンして、このコードが付いた工程をジョブとして集める ----
    function scanJobs(){
      const jobs = [];
      for(let i=0;i<localStorage.length;i++){
        const key = localStorage.key(i);
        if(!key || key.indexOf('sakaeIS_buhinhyoMock_v1_')!==0) continue;
        let bs;
        try{ bs = JSON.parse(localStorage.getItem(key)); }catch(e){ continue; }
        if(!bs || !bs.order) continue;
        (bs.parts||[]).forEach(part=>{
          const all = part.processes || [];
          const dated = all.filter(p=>p.date).slice().sort((a,b)=>{
            const ka = a.date + (a.ampm==='PM'?'_2':'_1');
            const kb = b.date + (b.ampm==='PM'?'_2':'_1');
            return ka.localeCompare(kb);
          });
          all.forEach(proc=>{
            if(proc.code !== CODE) return;
            let prevCode = '', nextCode = '', deadline = '';
            if(proc.date){
              const pos = dated.findIndex(p=>p.id===proc.id);
              if(pos > 0) prevCode = dated[pos-1].code;
              if(pos !== -1 && pos < dated.length-1){ nextCode = dated[pos+1].code; deadline = dated[pos+1].date; }
            }
            jobs.push({
              productNo: bs.order.productNo||'', orderNo: bs.order.orderNo||'', customer: bs.order.customer||'',
              model: bs.order.model||'', orderDueDate: bs.order.dueDate||'',
              partId: part.id, partName: part.name||'', qty: part.qty||'',
              procId: proc.id, code: proc.code, date: proc.date||'', ampm: proc.ampm||'AM', days: proc.days||3,
              prevCode, nextCode, deadline
            });
          });
        });
      }
      return jobs;
    }
    function writeBackProcessDate(productNo, procId, dateStr, ampm, days){
      if(!productNo) return;
      const key = 'sakaeIS_buhinhyoMock_v1_' + productNo;
      let bs;
      try{ bs = JSON.parse(localStorage.getItem(key)); }catch(e){ return; }
      if(!bs) return;
      let found = false;
      (bs.parts||[]).forEach(part=>{
        (part.processes||[]).forEach(proc=>{
          if(proc.id === procId){
            proc.date = dateStr; proc.ampm = ampm;
            if(days !== undefined) proc.days = days;
            found = true;
          }
        });
      });
      if(found) localStorage.setItem(key, JSON.stringify(bs));
    }

    // ---- 工程そのものを削除（日付をクリアするだけでなく、部品表からその工程を完全に取り除く）。
    // 受注連絡書から案件ごと削除された後などに「日付未設定」欄に残り続けてしまう工程を、ここから消せるようにする ----
    function deleteProcess(productNo, procId){
      if(!productNo) return null;
      const key = 'sakaeIS_buhinhyoMock_v1_' + productNo;
      let bs;
      try{ bs = JSON.parse(localStorage.getItem(key)); }catch(e){ return null; }
      if(!bs) return null;
      let removed = null;
      (bs.parts||[]).forEach(part=>{
        const idx = (part.processes||[]).findIndex(p=>p.id===procId);
        if(idx !== -1){
          removed = { productNo, partId: part.id, procIndex: idx, proc: JSON.parse(JSON.stringify(part.processes[idx])) };
          part.processes.splice(idx, 1);
        }
      });
      if(removed) localStorage.setItem(key, JSON.stringify(bs));
      return removed;
    }
    function restoreProcess(snapshot){
      if(!snapshot) return;
      const key = 'sakaeIS_buhinhyoMock_v1_' + snapshot.productNo;
      let bs;
      try{ bs = JSON.parse(localStorage.getItem(key)); }catch(e){ return; }
      if(!bs) return;
      const part = (bs.parts||[]).find(p=>p.id===snapshot.partId);
      if(!part) return;
      part.processes = part.processes || [];
      part.processes.splice(Math.min(snapshot.procIndex, part.processes.length), 0, snapshot.proc);
      localStorage.setItem(key, JSON.stringify(bs));
    }

    // ---- 一度だけの移行処理：日数(days)機能を追加した際、初期値が半日(1)や1日分(2)のまま保存されてしまったデータを
    // 工程記号が読める3コマ（1.5日分）に底上げする。以降にユーザーが意図的に3コマ未満へ縮めた分は対象外（このバージョンより後に付いた値は触らない）。
    const DAYS_UPGRADE_KEY = 'sakaeIS_daysUpgrade3_v1';
    if(!localStorage.getItem(DAYS_UPGRADE_KEY)){
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(!k || k.indexOf('sakaeIS_buhinhyoMock_v1_')!==0) continue;
        let bsUp;
        try{ bsUp = JSON.parse(localStorage.getItem(k)); }catch(e){ continue; }
        if(!bsUp) continue;
        let changedUp = false;
        (bsUp.parts||[]).forEach(p=>(p.processes||[]).forEach(pr=>{
          if(pr.days === 1 || pr.days === 2){ pr.days = 3; changedUp = true; }
        }));
        if(changedUp) localStorage.setItem(k, JSON.stringify(bsUp));
      }
      localStorage.setItem(DAYS_UPGRADE_KEY, '1');
    }

    let jobs = scanJobs();
    function refreshJobs(){ jobs = scanJobs(); }

    // ---- レンダリング ----
    const ganttInner = document.getElementById('ganttInner');
    const ganttCard = document.querySelector('.ganttCard');
    const emptyState = document.getElementById('emptyState');
    let DAY_W = 30;
    const ZOOM_KEY = STORAGE_PREFIX + '_zoom';
    function loadZoom(){
      const v = Number(localStorage.getItem(ZOOM_KEY));
      return (v>=14 && v<=52) ? v : 30;
    }
    DAY_W = loadZoom();
    document.documentElement.style.setProperty('--day-w', DAY_W+'px');

    let weekendStyleEl = null;
    // ---- 月の区切り線：ヘッダーの月ラベル行と同じ濃さの縦線を、表の一番下の行まで伸ばして引く。
    // 日ごとの列は個別のDOM要素ではなくbackground-imageの縞模様で表現しているため、月境界も同じ仕組み（.trackへの2枚目の背景レイヤー）で描く。
    // 週末の縞は7日周期のrepeating-linear-gradientだが、月境界はカレンダー月ごとの不定間隔なので、表の全幅ぶんの通常のlinear-gradientを別レイヤーとして重ねる。 ----
    function buildMonthBoundaryStops(){
      const segs = getMonthSegments();
      const lineColor = '#8592a6';
      const lineW = 1.5;
      const stops = [];
      let cumulative = 0;
      segs.forEach((seg, i)=>{
        cumulative += seg.days;
        if(i === segs.length-1) return; // 表の右端（最後の区切り）には線を引かない
        const pos = cumulative*DAY_W;
        stops.push('transparent '+(pos-lineW)+'px', lineColor+' '+(pos-lineW)+'px', lineColor+' '+pos+'px', 'transparent '+pos+'px');
      });
      return stops;
    }
    function applyWeekendBackground(){
      const dow0 = RANGE_START.getDay();
      const stops = [];
      const half = DAY_W/2;
      const boundaryColor = 'rgba(20,35,70,.18)';
      const halfColor = 'rgba(20,35,70,.06)';
      for(let i=0;i<7;i++){
        const dow = (dow0+i)%7;
        const color = dow===0 ? 'rgba(220,38,38,.06)' : (dow===6 ? 'rgba(37,99,235,.06)' : 'transparent');
        const dayStart = i*DAY_W, mid = dayStart+half, dayEnd = (i+1)*DAY_W;
        stops.push(boundaryColor+' '+dayStart+'px', boundaryColor+' '+(dayStart+1)+'px');
        stops.push(color+' '+(dayStart+1)+'px', color+' '+(mid-0.5)+'px');
        stops.push(halfColor+' '+(mid-0.5)+'px', halfColor+' '+(mid+0.5)+'px');
        stops.push(color+' '+(mid+0.5)+'px', color+' '+dayEnd+'px');
      }
      const monthStops = buildMonthBoundaryStops();
      const hasMonthLine = monthStops.length > 0;
      const images = 'repeating-linear-gradient(to right,'+stops.join(',')+')'
        + (hasMonthLine ? ', linear-gradient(to right,'+monthStops.join(',')+')' : '');
      const repeats = 'repeat-x' + (hasMonthLine ? ', no-repeat' : '');
      const sizes = (7*DAY_W)+'px 100%' + (hasMonthLine ? ', 100% 100%' : '');
      if(!weekendStyleEl){
        weekendStyleEl = document.createElement('style');
        document.head.appendChild(weekendStyleEl);
      }
      weekendStyleEl.textContent = '.track{ background-image:'+images+'; background-repeat:'+repeats+'; background-size:'+sizes+'; }';
    }
    applyWeekendBackground();

    function setZoom(px){
      DAY_W = Math.max(14, Math.min(52, px));
      localStorage.setItem(ZOOM_KEY, String(DAY_W));
      document.documentElement.style.setProperty('--day-w', DAY_W+'px');
      const rb = document.getElementById('zoomResetBtn');
      if(rb) rb.textContent = Math.round(DAY_W/30*100)+'%';
      applyWeekendBackground();
      render();
    }
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');
    if(zoomInBtn) zoomInBtn.addEventListener('click', ()=> setZoom(DAY_W+4));
    if(zoomOutBtn) zoomOutBtn.addEventListener('click', ()=> setZoom(DAY_W-4));
    if(zoomResetBtn){
      zoomResetBtn.addEventListener('click', ()=> setZoom(30));
      zoomResetBtn.textContent = Math.round(DAY_W/30*100)+'%';
    }

    function buildHeader(){
      const segs = getMonthSegments();
      const total = segs.reduce((a,s)=>a+s.days,0);
      const todayIdxVal = todayIdx();

      let monthRow = '<div class="ganttMonthRow">';
      monthRow += '<div class="ganttSideHead" style="border-right:1.5px solid #222;width:'+SIDE_W+'px;"></div>';
      segs.forEach(seg=>{
        monthRow += '<div class="monthCell" style="width:'+(seg.days*DAY_W)+'px;flex:0 0 '+(seg.days*DAY_W)+'px;">'+esc(seg.label)+'</div>';
      });
      monthRow += '</div>';

      let dayRow = '<div class="ganttHeaderRow">';
      dayRow += '<div class="ganttSideHead" style="width:'+SIDE_W+'px;">'
        + COLS.map(c=>'<div class="colHead" style="width:'+c.width+'px;flex:0 0 '+c.width+'px;">'+esc(c.label)+'</div>').join('')
        + '</div>';
      for(let i=1;i<=total;i++){
        const date = dateForIdx(i);
        const dow = date.getDay();
        const cls = dow===0 ? ' sun' : (dow===6 ? ' sat' : '');
        const todayCls = (i===todayIdxVal) ? ' today' : '';
        dayRow += '<div class="ganttDayCell'+cls+todayCls+'">'+date.getDate()+'</div>';
      }
      dayRow += '</div>';
      return monthRow + dayRow;
    }

    function buildBarHtml(job){
      // 作業票の工程日は「終了（納期）」を表すため、バーの右端をjob.dateに合わせ、そこから日数ぶん手前を左端にする。
      const endHalf = halfIdxForDate(parseDateStr(job.date), job.ampm==='PM');
      const days = job.days || 3;
      const startHalf = Math.max(1, endHalf-(days-1));
      const HALF_W = DAY_W/2;
      const left = (startHalf-1)*HALF_W;
      const width = HALF_W*(endHalf-startHalf+1);
      const startHint = days>1 ? (fmtShort((function(){ const h=dateForHalfIdx(startHalf); const d=h.date; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })(), (dateForHalfIdx(startHalf).isPM?'PM':'AM'))+'　～　') : '';
      const ctxHint = '\n（右クリックで削除メニュー）';
      const dateHint = '\n'+startHint+fmtShort(job.date, job.ampm)+'（右端＝部品表の工程日付「終了・納期」とリンク中。ドラッグで移動、端をつまむと日数を変更できます）'+ctxHint;
      return '<div class="bar" data-range="'+job.procId+'" style="left:'+left+'px;width:'+width+'px;background:'+COLOR+';" title="'+esc((job.productNo?job.productNo+' ':'')+job.partName)+dateHint+'">'
        + '<div class="handle left" data-role="handle-left"></div>'
        + '<span class="barLabel">🔗</span>'
        + '<div class="handle right" data-role="handle-right"></div>'
        + '</div>';
    }

    function colValHtml(job, col){
      if(col.editable){
        const val = (extra[job.procId] && extra[job.procId].manHour) || '';
        return '<input data-field="manHour" data-procid="'+job.procId+'" value="'+esc(val)+'" placeholder="h">';
      }
      if(col.key === 'completeDeadline'){
        if(!job.deadline){
          return '<div class="colVal muted">―</div>';
        }
        const dLeft = daysUntil(job.deadline);
        let cls = '', badge = '';
        if(dLeft !== null){
          if(dLeft < 0){ cls = ' due-over'; badge = '<span class="dueBadge over">期限超過</span>'; }
          else if(dLeft <= 2){ cls = ' due-soon'; badge = '<span class="dueBadge soon">あと'+dLeft+'日</span>'; }
        }
        return '<div class="colVal'+cls+'" title="'+esc(fmtShort(job.deadline))+'">'+esc(fmtShort(job.deadline))+badge+'</div>';
      }
      let v = '';
      switch(col.key){
        case 'no': v = job.orderNo; break;
        case 'customer': v = job.customer; break;
        case 'model': v = job.model; break;
        case 'dueDate': v = fmtShort(job.orderDueDate); break;
        case 'itemName': v = job.partName; break;
        case 'qty': v = job.qty; break;
        case 'process': v = job.code; break;
        case 'prevProcess': v = job.prevCode; break;
        case 'completeSchedule': v = fmtShort(job.date, job.ampm); break;
        case 'nextProcess': v = job.nextCode; break;
      }
      const muted = v ? '' : ' muted';
      return '<div class="colVal'+muted+'" title="'+esc(v)+'">'+(esc(v)||'―')+'</div>';
    }

    function buildRows(scheduled){
      const unitCount = currentUnitCount();
      const totalDayWidth = unitCount * DAY_W;
      let html = '';
      scheduled.forEach(job=>{
        html += '<div class="jobRow" data-row="'+job.procId+'">';
        html += '<div class="jobSideCell" style="width:'+SIDE_W+'px;">'
          + COLS.map(c=>'<div class="colCell" style="width:'+c.width+'px;flex:0 0 '+c.width+'px;">'+colValHtml(job,c)+'</div>').join('')
          + '</div>';
        html += '<div class="track" data-role="track" data-procid="'+job.procId+'" data-unit-count="'+unitCount+'" style="width:'+totalDayWidth+'px;">';
        html += buildBarHtml(job);
        html += '</div>';
        html += '</div>';
      });
      return html;
    }

    function render(){
      refreshJobs();
      const scheduled = jobs.filter(j=>j.date).sort((a,b)=>{
        const ka = a.date + (a.ampm==='PM'?'_2':'_1');
        const kb = b.date + (b.ampm==='PM'?'_2':'_1');
        return ka.localeCompare(kb);
      });
      if(scheduled.length === 0){
        ganttCard.querySelector('.ganttScroll').style.display = 'none';
        emptyState.style.display = 'block';
        emptyState.textContent = '「'+CODE+'」の日程が入っている工程はまだありません（部品表で日付を入れると、または下の「未日程」欄から日付を決めるとここに表示されます）。';
      }else{
        ganttCard.querySelector('.ganttScroll').style.display = '';
        emptyState.style.display = 'none';
        ganttInner.innerHTML = buildHeader() + buildRows(scheduled);
      }
      renderMemoLayer();
      document.getElementById('footNote').innerHTML =
        '部品表（各品番）を横断的にスキャンして、工程コードが「'+esc(CODE)+'」のものを自動的に表示しています。社内No～次工程は部品表由来の表示のみ（工数を除き編集不可）。バーの位置は部品表に保存されます。';
      renderUnassigned();
      if(summaryRowEl){
        const overCount = scheduled.filter(j=>{ const d=daysUntil(j.deadline); return d!==null && d<0; }).length;
        const soonCount = scheduled.filter(j=>{ const d=daysUntil(j.deadline); return d!==null && d>=0 && d<=2; }).length;
        summaryRowEl.innerHTML =
          '<span class="sumChip">日程あり <b>'+scheduled.length+'</b>件</span>'
          + (soonCount ? '<span class="sumChip warn">期限間近 <b>'+soonCount+'</b>件</span>' : '')
          + (overCount ? '<span class="sumChip danger">期限超過 <b>'+overCount+'</b>件</span>' : '');
      }
    }

    // ---- 日付未設定のジョブ一覧：ここから初めて日付を入れるとバーとして表示されるようになる ----
    function renderUnassigned(){
      const list = jobs.filter(j=>!j.date);
      const listEl = document.getElementById('unassignedList');
      const countEl = document.getElementById('unassignedCount');
      if(countEl) countEl.textContent = list.length ? '（'+list.length+'件）' : '';
      if(!listEl) return;
      if(!list.length){
        listEl.innerHTML = '<div class="unassignedEmpty">日付未設定の「'+esc(CODE)+'」工程はありません。</div>';
        return;
      }
      listEl.innerHTML = list.map(j=>{
        const info = (j.productNo?'<b>'+esc(j.productNo)+'</b> ':'')+esc(j.partName)+(j.customer?'　'+esc(j.customer):'');
        return '<div class="unassignedItem">'
          + '<span class="uiInfo">'+info+'</span>'
          + '<span class="uiForm">'
          + '<input type="date" data-role="ui-date" data-procid="'+esc(j.procId)+'">'
          + '<select data-role="ui-ampm" data-procid="'+esc(j.procId)+'"><option value="AM">午前</option><option value="PM">午後</option></select>'
          + '<button type="button" class="uiAssignBtn" data-role="ui-assign" data-procid="'+esc(j.procId)+'" data-productno="'+esc(j.productNo)+'">日程を決める</button>'
          + '<button type="button" class="uiAssignBtn uiDeleteBtn" data-role="ui-delete" data-procid="'+esc(j.procId)+'" data-productno="'+esc(j.productNo)+'" title="この工程自体を削除します">削除</button>'
          + '</span>'
          + '</div>';
      }).join('');
    }
    document.getElementById('unassignedList') && document.getElementById('unassignedList').addEventListener('click', (e)=>{
      const assignBtn = e.target.closest('[data-role="ui-assign"]');
      if(assignBtn){
        const procId = assignBtn.dataset.procid;
        const productNo = assignBtn.dataset.productno;
        const row = assignBtn.closest('.unassignedItem');
        const dateInput = row.querySelector('[data-role="ui-date"]');
        const ampmSelect = row.querySelector('[data-role="ui-ampm"]');
        if(!dateInput.value){ alert('日付を選んでください。'); return; }
        writeBackProcessDate(productNo, procId, dateInput.value, ampmSelect.value);
        render();
        return;
      }
      const deleteBtn = e.target.closest('[data-role="ui-delete"]');
      if(deleteBtn){
        const procId = deleteBtn.dataset.procid;
        const productNo = deleteBtn.dataset.productno;
        const job = jobs.find(j=>j.procId===procId);
        const label = job ? ((job.productNo?job.productNo+' ':'')+job.partName+'（'+esc(CODE)+'）') : 'この工程';
        if(!window.confirm(label+'を削除します。作業票・個別日程表など他の画面からもこの工程が消えます（日程未設定に戻すのではなく完全に削除します）。よろしいですか？')) return;
        const snapshot = deleteProcess(productNo, procId);
        render();
        if(snapshot){
          showUndo(label+'を削除しました', ()=>{
            restoreProcess(snapshot);
            render();
          });
        }
        return;
      }
    });

    // ---- 表示期間の選択UI：旧・1/2/3ヶ月表示トグル（#monthToggle）を、開始日・終了日を自由指定できるピッカーに差し替える。
    // 静的HTML側は直していないので、ここで#monthToggleを見つけて置き換える（無ければtoolRowの先頭に追加）。 ----
    const toolRowEl = document.querySelector('.toolRow');
    let rangeToggleEl = document.getElementById('rangeToggle');
    if(!rangeToggleEl && toolRowEl){
      rangeToggleEl = document.createElement('div');
      rangeToggleEl.className = 'rangeToggle';
      rangeToggleEl.id = 'rangeToggle';
      rangeToggleEl.innerHTML =
        '表示期間'
        + '<input type="date" id="viewStartInput">'
        + '<span class="rangeTilde">～</span>'
        + '<input type="date" id="viewEndInput">'
        + '<button type="button" class="rangeResetBtn" id="rangeResetBtn" title="全バーの開始日～終了日（データが無ければ今日から1ヶ月）に戻す">初期表示に戻す</button>';
      const oldMonthToggleEl = document.getElementById('monthToggle');
      if(oldMonthToggleEl){
        oldMonthToggleEl.replaceWith(rangeToggleEl);
      }else{
        toolRowEl.insertBefore(rangeToggleEl, toolRowEl.firstChild);
      }
    }
    const viewStartInput = document.getElementById('viewStartInput');
    const viewEndInput = document.getElementById('viewEndInput');
    function updateRangeInputsUI(){
      if(!viewStartInput || !viewEndInput) return;
      viewStartInput.value = fmtDateForInput(viewStart);
      viewEndInput.value = fmtDateForInput(viewEnd);
    }
    function applyViewChange(newStart, newEnd){
      if(!newStart || !newEnd || newEnd < newStart){ updateRangeInputsUI(); return; }
      const maxEnd = new Date(newStart);
      maxEnd.setDate(maxEnd.getDate()+MAX_RANGE_DAYS-1);
      if(newEnd > maxEnd) newEnd = maxEnd;
      viewStart = newStart; viewEnd = newEnd;
      RANGE_START = viewStart;
      saveView();
      updateRangeInputsUI();
      applyWeekendBackground();
      render();
    }
    if(viewStartInput && viewEndInput){
      viewStartInput.addEventListener('change', ()=> applyViewChange(parseDateStr(viewStartInput.value), viewEnd));
      viewEndInput.addEventListener('change', ()=> applyViewChange(viewStart, parseDateStr(viewEndInput.value)));
    }
    const rangeResetBtn = document.getElementById('rangeResetBtn');
    if(rangeResetBtn){
      rangeResetBtn.addEventListener('click', ()=>{
        const def = computeDefaultView();
        viewStart = def.start; viewEnd = def.end;
        RANGE_START = viewStart;
        saveView();
        updateRangeInputsUI();
        applyWeekendBackground();
        render();
      });
    }
    updateRangeInputsUI();

    // ---- 自由配置メモ（吹き出し）の追加ボタン。静的HTML側には無いので、ここでtoolRowに追加する ----
    let addMemoBtn = document.getElementById('addMemoBtn');
    if(!addMemoBtn && toolRowEl){
      addMemoBtn = document.createElement('button');
      addMemoBtn.type = 'button';
      addMemoBtn.id = 'addMemoBtn';
      addMemoBtn.className = 'addMemoBtn';
      addMemoBtn.textContent = '＋ メモを追加';
      toolRowEl.appendChild(addMemoBtn);
    }
    if(addMemoBtn){
      addMemoBtn.addEventListener('click', ()=>{
        const scrollEl = ganttCard.querySelector('.ganttScroll');
        const id = uid();
        memos.push({ id, x: (scrollEl?scrollEl.scrollLeft:0)+24, y:24, w:180, h:92, text:'' });
        saveMemos();
        render();
        const bodyEl = ganttInner.querySelector('.memoNote[data-memo-id="'+id+'"] [data-role="memoBody"]');
        if(bodyEl) bodyEl.focus();
      });
    }

    // ---- 工数（ローカル仮項目）の直接編集 ----
    ganttInner.addEventListener('input', (e)=>{
      const field = e.target.dataset.field;
      if(field !== 'manHour') return;
      const procId = e.target.dataset.procid;
      extra[procId] = extra[procId] || {};
      extra[procId].manHour = e.target.value;
      saveExtra();
    });

    render();

    // ---- ドラッグ操作：バーの移動のみ（幅は半日固定・伸縮なし。行をまたいだ移動も無し） ----
    let drag = null;
    function unitFromClientX(trackEl, clientX){
      const rect = trackEl.getBoundingClientRect();
      const dayCount = Number(trackEl.dataset.unitCount) || currentUnitCount();
      const halfCount = dayCount * 2;
      let idx = Math.floor((clientX - rect.left) / (DAY_W/2)) + 1;
      if(idx < 1) idx = 1;
      if(idx > halfCount) idx = halfCount;
      return idx;
    }
    function updateBarVisual(trackEl, procId, startHalf, endHalf){
      const barEl = trackEl.querySelector('[data-range="'+procId+'"]');
      if(!barEl) return;
      const HALF_W = DAY_W/2;
      barEl.style.left = ((startHalf-1)*HALF_W)+'px';
      barEl.style.width = ((endHalf-startHalf+1)*HALF_W)+'px';
    }

    // ---- バーの右クリックメニュー：削除（バー上に常時出る×は誤操作しやすかったため廃止）。
    // 「削除」は実際にはこの工程の日付をクリアして未日程に戻す処理で、部品表・個別日程表など他画面とデータを共有しているため、
    // それらの画面からもこの工程の日程が消えることを削除前に警告する。 ----
    let barCtxMenu = document.getElementById('procGanttBarCtxMenu');
    if(!barCtxMenu){
      barCtxMenu = document.createElement('div');
      barCtxMenu.id = 'procGanttBarCtxMenu';
      barCtxMenu.className = 'barCtxMenu';
      barCtxMenu.innerHTML = '<button type="button" class="danger" id="procGanttCtxDelete">削除</button>';
      document.body.appendChild(barCtxMenu);
    }
    const ctxDeleteBtn = barCtxMenu.querySelector('#procGanttCtxDelete');

    // ---- 直前の1操作だけ元に戻せる仕組み（削除など）。このページを開いている間だけ有効（保存はしない）。
    // 新しく別の操作をすると、前の「戻す」は上書きされて消える（複数段階は戻せない）。
    // 静的HTML側にトースト要素が無いので、ここで作って差し込む（右クリックメニューと同じやり方）。 ----
    let undoToastEl = document.getElementById('procGanttUndoToast');
    if(!undoToastEl){
      undoToastEl = document.createElement('div');
      undoToastEl.id = 'procGanttUndoToast';
      undoToastEl.className = 'undoToast';
      undoToastEl.innerHTML = '<span id="procGanttUndoToastText"></span><button type="button" id="procGanttUndoToastBtn">元に戻す</button>';
      document.body.appendChild(undoToastEl);
    }
    const undoToastTextEl = undoToastEl.querySelector('#procGanttUndoToastText');
    const undoToastBtn = undoToastEl.querySelector('#procGanttUndoToastBtn');
    let lastUndo = null;
    let undoToastTimer = null;
    function showUndo(message, undoFn){
      lastUndo = { undo: undoFn };
      undoToastTextEl.textContent = message;
      undoToastEl.classList.add('show');
      if(undoToastTimer) clearTimeout(undoToastTimer);
      undoToastTimer = setTimeout(()=>{ undoToastEl.classList.remove('show'); lastUndo = null; }, 8000);
    }
    if(!undoToastBtn.dataset.bound){
      undoToastBtn.dataset.bound = '1';
      undoToastBtn.addEventListener('click', ()=>{
        if(!lastUndo) return;
        const fn = lastUndo.undo;
        lastUndo = null;
        undoToastEl.classList.remove('show');
        if(undoToastTimer) clearTimeout(undoToastTimer);
        fn();
      });
    }
    if(!window.__procGanttUndoKeyBound){
      window.__procGanttUndoKeyBound = true;
      // Ctrl+Z／Cmd+Zでも同じ「元に戻す」を実行できるようにする（入力欄内では文字の入力取り消しを邪魔しないよう素通りさせる）
      document.addEventListener('keydown', (e)=>{
        if((e.key!=='z' && e.key!=='Z') || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if(tag==='INPUT' || tag==='TEXTAREA') return;
        if(!lastUndo) return;
        e.preventDefault();
        const fn = lastUndo.undo;
        lastUndo = null;
        undoToastEl.classList.remove('show');
        if(undoToastTimer) clearTimeout(undoToastTimer);
        fn();
      });
    }
    let ctxTargetProcId = null;
    function openBarCtxMenu(procId, x, y){
      ctxTargetProcId = procId;
      barCtxMenu.classList.add('open');
      const menuW = 150;
      let left = x, top = y;
      if(left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;
      if(left < 10) left = 10;
      barCtxMenu.style.left = left+'px';
      barCtxMenu.style.top = top+'px';
    }
    function closeBarCtxMenu(){
      barCtxMenu.classList.remove('open');
      ctxTargetProcId = null;
    }
    ganttInner.addEventListener('contextmenu', (e)=>{
      const barEl = e.target.closest('[data-range]');
      if(!barEl) return;
      e.preventDefault();
      openBarCtxMenu(barEl.dataset.range, e.clientX, e.clientY);
    });
    document.addEventListener('click', (e)=>{
      if(!barCtxMenu.classList.contains('open')) return;
      if(barCtxMenu.contains(e.target)) return;
      closeBarCtxMenu();
    });
    window.addEventListener('scroll', closeBarCtxMenu, true);
    ctxDeleteBtn.addEventListener('click', ()=>{
      const procId = ctxTargetProcId;
      closeBarCtxMenu();
      if(!procId) return;
      const job = jobs.find(j=>j.procId===procId);
      if(!job) return;
      if(!window.confirm('この工程の日程を削除します。作業票・個別日程表など他の画面のこの工程の日程も一緒に消えます。よろしいですか？')) return;
      const snapshot = { date: job.date, ampm: job.ampm, days: job.days };
      const productNo = job.productNo;
      writeBackProcessDate(productNo, procId, '', 'AM');
      render();
      showUndo('工程の日程を削除しました', ()=>{
        writeBackProcessDate(productNo, procId, snapshot.date, snapshot.ampm, snapshot.days);
        render();
      });
    });

    ganttInner.addEventListener('mousedown', (e)=>{
      const handleLeft = e.target.closest('[data-role="handle-left"]');
      const handleRight = e.target.closest('[data-role="handle-right"]');
      const barEl = e.target.closest('[data-range]');
      if(!barEl) return;
      e.preventDefault();
      const trackEl = barEl.closest('[data-role="track"]');
      const procId = trackEl.dataset.procid;
      const job = jobs.find(j=>j.procId===procId);
      if(!job) return;
      // 作業票の工程日は「終了（納期）」を表すため、endHalfをjob.dateに合わせ、そこから日数ぶん手前をstartHalfにする。
      const endHalf = halfIdxForDate(parseDateStr(job.date), job.ampm==='PM');
      const days = job.days || 3;
      const startHalf = Math.max(1, endHalf - (days - 1));
      const startUnit = unitFromClientX(trackEl, e.clientX);
      let mode = 'move';
      if(handleLeft) mode = 'resize-left';
      else if(handleRight) mode = 'resize-right';
      drag = { trackEl, procId, job, mode, startHalf, endHalf, startUnit, workingStart: startHalf, workingEnd: endHalf };
    });
    document.addEventListener('mousemove', (e)=>{
      if(!drag) return;
      const unit = unitFromClientX(drag.trackEl, e.clientX);
      const delta = unit - drag.startUnit;
      const unitCount = (Number(drag.trackEl.dataset.unitCount) || currentUnitCount()) * 2;
      if(drag.mode === 'move'){
        const span = drag.endHalf - drag.startHalf;
        let ns = drag.startHalf + delta;
        if(ns < 1) ns = 1;
        if(ns + span > unitCount) ns = unitCount - span;
        drag.workingStart = ns; drag.workingEnd = ns + span;
      }else if(drag.mode === 'resize-left'){
        let ns = drag.startHalf + delta;
        if(ns < 1) ns = 1;
        if(ns > drag.endHalf) ns = drag.endHalf;
        drag.workingStart = ns; drag.workingEnd = drag.endHalf;
      }else{
        let ne = drag.endHalf + delta;
        if(ne > unitCount) ne = unitCount;
        if(ne < drag.startHalf) ne = drag.startHalf;
        drag.workingStart = drag.startHalf; drag.workingEnd = ne;
      }
      updateBarVisual(drag.trackEl, drag.procId, drag.workingStart, drag.workingEnd);
    });
    document.addEventListener('mouseup', ()=>{
      if(!drag) return;
      if(drag.workingStart !== drag.startHalf || drag.workingEnd !== drag.endHalf){
        const h = dateForHalfIdx(drag.workingEnd);
        const dt = h.date;
        const dateStr = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
        const days = drag.workingEnd - drag.workingStart + 1;
        writeBackProcessDate(drag.job.productNo, drag.procId, dateStr, h.isPM?'PM':'AM', days);
        render();
      }
      drag = null;
    });

    // ---- 自由配置メモ（吹き出し）：ドラッグ移動・リサイズ・テキスト編集・右クリック削除（元に戻す対応） ----
    let memoCtxMenu = document.getElementById('procGanttMemoCtxMenu');
    if(!memoCtxMenu){
      memoCtxMenu = document.createElement('div');
      memoCtxMenu.id = 'procGanttMemoCtxMenu';
      memoCtxMenu.className = 'barCtxMenu';
      memoCtxMenu.innerHTML = '<button type="button" class="danger" id="procGanttCtxDeleteMemo">削除</button>';
      document.body.appendChild(memoCtxMenu);
    }
    const ctxDeleteMemoBtn = memoCtxMenu.querySelector('#procGanttCtxDeleteMemo');
    let ctxMemoTarget = null;
    function openMemoCtxMenu(memoId, x, y){
      ctxMemoTarget = memoId;
      memoCtxMenu.classList.add('open');
      const menuW = 140;
      let left = x, top = y;
      if(left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;
      if(left < 10) left = 10;
      memoCtxMenu.style.left = left+'px';
      memoCtxMenu.style.top = top+'px';
    }
    function closeMemoCtxMenu(){
      memoCtxMenu.classList.remove('open');
      ctxMemoTarget = null;
    }
    ganttInner.addEventListener('contextmenu', (e)=>{
      const noteEl = e.target.closest('.memoNote');
      if(!noteEl) return;
      e.preventDefault();
      openMemoCtxMenu(noteEl.dataset.memoId, e.clientX, e.clientY);
    });
    document.addEventListener('click', (e)=>{
      if(!memoCtxMenu.classList.contains('open')) return;
      if(memoCtxMenu.contains(e.target)) return;
      closeMemoCtxMenu();
    });
    window.addEventListener('scroll', closeMemoCtxMenu, true);
    if(ctxDeleteMemoBtn){
      ctxDeleteMemoBtn.addEventListener('click', ()=>{
        if(!ctxMemoTarget) return;
        const idx = memos.findIndex(m=>m.id===ctxMemoTarget);
        closeMemoCtxMenu();
        if(idx===-1) return;
        const snapshot = JSON.parse(JSON.stringify(memos[idx]));
        memos.splice(idx,1);
        saveMemos();
        render();
        showUndo('メモを削除しました', ()=>{
          memos.splice(Math.min(idx, memos.length), 0, snapshot);
          saveMemos();
          render();
        });
      });
    }

    let memoDrag = null; // { type:'move'|'resize', id, startClientX, startClientY, orig:{x,y,w,h} }
    ganttInner.addEventListener('mousedown', (e)=>{
      const handleEl = e.target.closest('[data-role="memoHandle"]');
      const resizeEl = e.target.closest('[data-role="memoResize"]');
      if(!handleEl && !resizeEl) return;
      const noteEl = e.target.closest('.memoNote');
      if(!noteEl) return;
      const memo = memos.find(m=>m.id===noteEl.dataset.memoId);
      if(!memo) return;
      e.preventDefault();
      memoDrag = { type: handleEl ? 'move' : 'resize', id: memo.id, startClientX: e.clientX, startClientY: e.clientY, orig:{ x:memo.x, y:memo.y, w:memo.w, h:memo.h } };
    });
    document.addEventListener('mousemove', (e)=>{
      if(!memoDrag) return;
      const memo = memos.find(m=>m.id===memoDrag.id);
      if(!memo) return;
      const dx = e.clientX - memoDrag.startClientX;
      const dy = e.clientY - memoDrag.startClientY;
      const noteEl = ganttInner.querySelector('.memoNote[data-memo-id="'+memoDrag.id+'"]');
      if(memoDrag.type==='move'){
        memo.x = Math.max(0, memoDrag.orig.x + dx);
        memo.y = Math.max(0, memoDrag.orig.y + dy);
        if(noteEl){ noteEl.style.left = memo.x+'px'; noteEl.style.top = memo.y+'px'; }
      }else{
        memo.w = Math.max(90, memoDrag.orig.w + dx);
        memo.h = Math.max(56, memoDrag.orig.h + dy);
        if(noteEl){ noteEl.style.width = memo.w+'px'; noteEl.style.height = memo.h+'px'; }
      }
    });
    document.addEventListener('mouseup', ()=>{
      if(!memoDrag) return;
      memoDrag = null;
      saveMemos();
    });
    ganttInner.addEventListener('input', (e)=>{
      const bodyEl = e.target.closest('[data-role="memoBody"]');
      if(!bodyEl) return;
      const noteEl = bodyEl.closest('.memoNote');
      const memo = memos.find(m=>m.id===noteEl.dataset.memoId);
      if(memo){ memo.text = bodyEl.value; saveMemos(); }
    });

    // ---- 他のタブ（部品表・別の工程日程表タブ）での変更をリアルタイムに反映 ----
    window.addEventListener('storage', (e)=>{
      if(!e.key) return;
      if(e.key.indexOf('sakaeIS_buhinhyoMock_v1_')===0 || e.key===EXTRA_KEY){
        extra = loadExtra();
        render();
      }
    });
  }

  return { init: init };
})();
