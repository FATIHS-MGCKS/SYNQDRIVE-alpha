import { PriceTariffsPage } from './price-tariffs/PriceTariffsPage';

interface PriceTariffsViewProps {
  isDarkMode: boolean;
}

/** @deprecated tariffs props removed — data loads from Pricing API */
export function PriceTariffsView({ isDarkMode }: PriceTariffsViewProps) {
  return <PriceTariffsPage isDarkMode={isDarkMode} />;
}
