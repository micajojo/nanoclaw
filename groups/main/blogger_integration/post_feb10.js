require('dotenv').config();
const { sendToBlogger } = require('./send_to_blogger');

const title = '한국여성폭력 일일 리포트 - 2026년 2월 10일';

const content = `
<h2>한국여성폭력 일일 리포트</h2>
<h2>(Daily Violence Against Women Cases in South Korea)</h2>

<h3>날짜 (Date) : 2026년 2월 10일</h3>

<p>총 보도된 사건 수: 0<br>
(Total Case Reports: 0)<br></p>

<p>지난 24시간 동안 보도된 사건 기사 없음.<br>
(No case reports published in the last 24 hours)<br></p>

<hr>
<p style="text-align: right;">이 보고서는 매일 오후 6시(KST)에 자동으로 게시됩니다.<br>
This report is automatically posted daily at 6:00 PM KST.</p>
`.trim();

sendToBlogger(title, content)
  .then(() => {
    console.log('✅ Posted to blog: wandhealth.blogspot.com');
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
