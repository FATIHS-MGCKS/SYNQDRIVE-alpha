/** Positive fixture: HomeAwayBadge-class indirect title via local const */
export function BadHomeAwayRegression() {
  const tooltip = 'Fahrzeug steht am Heimatstandort (Umkreis 500 m)';
  return <span title={tooltip}>HOME</span>;
}
