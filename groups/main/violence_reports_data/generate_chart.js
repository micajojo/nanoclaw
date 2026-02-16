const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

/**
 * Generate cumulative bar chart showing total case reports over time
 */
async function generateChart() {
  // Read database
  const dbPath = path.join(__dirname, 'reports_database.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // Prepare data - calculate cumulative totals
  const dates = db.reports.map(r => r.date);
  const dailyTotals = db.reports.map(r => r.total_cases);

  // Calculate cumulative sum
  const cumulativeTotals = [];
  let sum = 0;
  for (let i = 0; i < dailyTotals.length; i++) {
    sum += dailyTotals[i];
    cumulativeTotals.push(sum);
  }

  // Create chart
  const width = 800;
  const height = 400;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [{
        label: 'Cumulative Total Case Reports',
        data: cumulativeTotals,
        backgroundColor: 'rgba(220, 38, 38, 0.7)',
        borderColor: 'rgba(220, 38, 38, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Cumulative Violence Against Women Case Reports in South Korea',
          font: { size: 16 }
        },
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          title: {
            display: true,
            text: 'Cumulative Number of Cases'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Date'
          }
        }
      }
    }
  };

  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  const outputPath = path.join(__dirname, 'violence_reports_chart.png');
  fs.writeFileSync(outputPath, imageBuffer);

  console.log(`✅ Cumulative chart generated: ${outputPath}`);
  console.log(`Total cumulative cases: ${sum}`);
  return outputPath;
}

// Run if called directly
if (require.main === module) {
  generateChart()
    .then(path => console.log('Chart saved to:', path))
    .catch(err => console.error('Error:', err));
}

module.exports = { generateChart };
