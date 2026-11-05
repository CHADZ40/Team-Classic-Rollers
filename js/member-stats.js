const stats = document.querySelector('#memberStats');

if (stats) {
  const games = Math.max(0, Number(stats.dataset.games) || 0);
  const scores = Math.max(0, Number(stats.dataset.scores) || 0);
  const goal = Math.max(1, Number(stats.dataset.goal) || 1);
  const average = games > 0 ? scores / games : 0;
  const percentage = Math.min(100, Math.max(0, (average / goal) * 100));

  document.querySelector('#totalGames').textContent = games;
  document.querySelector('#totalScores').textContent = scores;
  document.querySelector('#averageScore').textContent = average.toFixed(1);
  document.querySelector('#averageGoalValue').textContent = `${average.toFixed(1)} / ${goal}`;
  document.querySelector('#averageGoalFill').style.width = `${percentage}%`;
  document.querySelector('#averageGoalText').textContent = `${percentage.toFixed(0)}% of ${goal} goal`;
}
