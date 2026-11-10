import { useEffect, useRef } from 'react';

interface StreamingCardProps {
  code: string;
}

// 생성 중에는 "코드" 탭을 고정으로 보여주며 LLM 응답을 실시간으로 표시한다.
// 완료되면 이 카드가 사라지고 "미리보기" 탭이 기본인 ComponentCard가 나타난다.
export function StreamingCard({ code }: StreamingCardProps) {
  const blockRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = blockRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [code]);

  return (
    <div className="window component-card" role="status" aria-live="polite">
      <div className="titlebar">
        <span className="titlebar-title">생성 중</span>
      </div>
      <div className="card-tabs" role="tablist">
        <button role="tab" aria-selected={false} className="tab" disabled>
          미리보기
        </button>
        <button role="tab" aria-selected className="tab tab--active">
          코드
        </button>
      </div>
      <div className="card-content">
        <div className="code-panel">
          <div className="panel-header">
            <h3>코드</h3>
            <span>컴포넌트를 생성하고 있습니다...</span>
          </div>
          <pre className="code-block" ref={blockRef}>
            <code>{code}</code>
            <span className="cursor" aria-hidden="true" />
          </pre>
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" />
          </div>
        </div>
      </div>
    </div>
  );
}
