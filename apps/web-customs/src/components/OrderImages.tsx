import { useEffect, useState } from 'react';
import { api } from '../store/auth';
import type { OrderImage } from '../types';
import { bytes } from '../utils/format';
import { Empty } from './Feedback';
import Icon from './Icon';
import Modal from './Modal';

export default function OrderImages({ images }: { images: OrderImage[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrderImage | null>(null);

  useEffect(() => {
    let active = true;
    const created: string[] = [];
    setLoading(true); setUrls({}); setFailed([]);
    Promise.all(images.map(async (image) => {
      try {
        const response = await api.get(`/api/customs/images/${image.id}/file`, { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        if (!active) { URL.revokeObjectURL(url); return; }
        created.push(url);
        setUrls((current) => ({ ...current, [image.id]: url }));
      } catch { if (active) setFailed((current) => [...current, image.id]); }
    })).finally(() => { if (active) setLoading(false); });
    return () => { active = false; created.forEach((url) => URL.revokeObjectURL(url)); };
  }, [images]);

  if (!images.length) return <Empty title="Nenhuma imagem enviada" description="Não há imagens de produtos vinculadas a este pedido." />;
  return (
    <>
      {failed.length > 0 && <p className="inline-warning" role="alert">Algumas imagens não puderam ser carregadas. Atualize o pedido para tentar novamente.</p>}
      <div className="image-grid" aria-busy={loading}>{images.map((image) => <div className="image-card" key={image.id}>{urls[image.id] ? <button type="button" className="image-button" onClick={() => setSelected(image)} aria-label={`Ampliar imagem ${image.file_name}`}><img src={urls[image.id]} alt={`Produto: ${image.file_name}`} /><span><Icon name="image" size={17} />Ampliar</span></button> : <div className="image-placeholder">{failed.includes(image.id) ? <Icon name="alert" /> : <span className="spinner" />}</div>}<div className="image-meta"><strong title={image.file_name}>{image.file_name}</strong><span>Linha {image.row_no} · {bytes(image.size_bytes)}</span></div></div>)}</div>
      {selected && urls[selected.id] && <Modal title={selected.file_name} onClose={() => setSelected(null)} wide><img className="image-full" src={urls[selected.id]} alt={`Visualização ampliada de ${selected.file_name}`} /><p className="muted">Linha {selected.row_no} · {bytes(selected.size_bytes)}</p></Modal>}
    </>
  );
}
