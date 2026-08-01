/* ==== Code 39 バーコード（依存ライブラリなしの自前実装） ====
   工数・変動費集計を実績ログとして取り込むための仕組み：作業票に品番・部品・工程を
   バーコードとして印刷しておき、実績入力画面でUSBバーコードリーダー（PCにキーボードとして
   認識される「キーボードウェッジ」方式）で読み取ると、その3項目が自動入力される。

   Code 39は数字・大文字・一部記号（- . スペース $ / + %）だけを扱える規格なので、
   エンコードする文字列（品番・品番コード・工程コード）は自動で大文字化し、
   対応外の文字は "-" に置き換えてから描画する。

   使い方：
     Code39.toSvg('44541-5201-DE', { height: 34, narrow: 1.6, ratio: 2.5 })
     → SVG文字列を返す（そのまま innerHTML に差し込める）
*/
window.Code39 = (function(){
  // ---- 文字 → 9要素パターン（0=細/1=太、bar・space交互で bar,space,bar,space,bar,space,bar,space,bar の5本＋4スペース） ----
  // どの文字も9要素中ちょうど3つが「太」になる（Code39＝"3 of 9"の由来）。
  const PATTERNS = {
    '0':'000110100','1':'100100001','2':'001100001','3':'101100000','4':'000110001',
    '5':'100110000','6':'001110000','7':'000100101','8':'100100100','9':'001100100',
    'A':'100001001','B':'001001001','C':'101001000','D':'000011001','E':'100011000',
    'F':'001011000','G':'000001101','H':'100001100','I':'001001100','J':'000011100',
    'K':'100000011','L':'001000011','M':'101000010','N':'000010011','O':'100010010',
    'P':'001010010','Q':'000000111','R':'100000110','S':'001000110','T':'000010110',
    'U':'110000001','V':'011000001','W':'111000000','X':'010010001','Y':'110010000',
    'Z':'011010000','-':'010000101','.':'110000100',' ':'011000100','$':'010101000',
    '/':'010100010','+':'010001010','%':'000101010','*':'010010100'
  };
  const ALLOWED = /[^0-9A-Z\-. $\/+%]/g;

  function sanitize(text){
    let s = (text==null ? '' : String(text)).toUpperCase();
    s = s.replace(ALLOWED, '-');
    return s;
  }

  // ---- 文字列 → SVG（開始・終了に * を自動付与） ----
  function toSvg(text, opts){
    opts = opts || {};
    const narrow = opts.narrow || 1.6;      // 細エレメント1本の幅(px)
    const ratio = opts.ratio || 2.5;        // 太エレメントは細の何倍か
    const height = opts.height || 34;       // バー部分の高さ(px)
    const quiet = opts.quiet != null ? opts.quiet : narrow*8; // 左右の余白（規格上は最低でも太の幅程度）
    const showText = opts.showText !== false;
    const wide = narrow * ratio;
    const gap = narrow; // 文字と文字の間の細いスペース

    const body = '*' + sanitize(text) + '*';
    let x = quiet;
    let rects = '';
    for(let ci=0; ci<body.length; ci++){
      const ch = body[ci];
      const pat = PATTERNS[ch] || PATTERNS['-'];
      for(let ei=0; ei<9; ei++){
        const isBar = (ei % 2 === 0); // 0,2,4,6,8 がバー／1,3,5,7 がスペース
        const w = (pat[ei]==='1') ? wide : narrow;
        if(isBar){
          rects += '<rect x="'+x.toFixed(2)+'" y="0" width="'+w.toFixed(2)+'" height="'+height+'" fill="#000"/>';
        }
        x += w;
      }
      x += gap; // 次の文字との間隔
    }
    const totalWidth = x + quiet - gap;
    const textHeight = showText ? 14 : 0;
    const svgH = height + textHeight + (showText?4:0);
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+totalWidth.toFixed(2)+' '+svgH+'" width="'+Math.round(totalWidth)+'" height="'+svgH+'">';
    svg += '<rect x="0" y="0" width="'+totalWidth.toFixed(2)+'" height="'+svgH+'" fill="#fff"/>';
    svg += rects;
    if(showText){
      svg += '<text x="'+(totalWidth/2).toFixed(2)+'" y="'+(height+12)+'" text-anchor="middle" font-family="monospace" font-size="10" fill="#000">'+sanitize(text)+'</text>';
    }
    svg += '</svg>';
    return svg;
  }

  return { toSvg: toSvg, sanitize: sanitize };
})();
