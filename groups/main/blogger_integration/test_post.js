require('dotenv').config();
const { sendToBlogger } = require('./send_to_blogger');

const title = '한국 여성 폭력 사건 - 2026년 2월 10일';

const content = `
<h2>한국 여성 폭력 사건 - 일일 리포트</h2>
<p><em>Violence Against Women Cases in South Korea - Daily Report</em></p>
<p><strong>날짜 (Date):</strong> 2026년 2월 10일 (February 10, 2026)</p>

<h3>총 사건 기사 수: 0</h3>
<p><em>(Total Case Reports: 0)</em></p>

<p>지난 24시간 동안 보도된 사건 기사 없음</p>
<p><em>(No case reports published in the last 24 hours)</em></p>

<hr>
<p><small>이 보고서는 매일 오후 6시(KST)에 자동으로 게시됩니다.<br>
This report is automatically posted daily at 6:00 PM KST.</small></p>
`.trim();

sendToBlogger(title, content)
  .then(() => {
    console.log('\n✅ Test complete! Check your blog at wandhealth.blogspot.com');
  })
  .catch(err => {
    console.error('❌ Error:', err);
  });
