import { describe, expect, it } from 'vitest';
import { describeEpisode, hasEpisodeTitles } from './episode-labels';

describe('episode source label presentation', () => {
  it('shows the original descriptive title alongside the playback number', () => {
    expect(describeEpisode(1, '  重逢：新的旅程  ')).toEqual({ number: 2, title: '重逢：新的旅程', label: '第2集 · 重逢：新的旅程' });
    expect(describeEpisode(0, '第01集 初入江湖').title).toBe('第01集 初入江湖');
  });

  it('suppresses only duplicate plain numbering for this exact index', () => {
    for (const title of ['01', '第01集', '第一集', '０１', '第１話', 'EP01', 'Episode 1']) {
      expect(describeEpisode(0, title)).toEqual({ number: 1, label: '第1集' });
    }
    expect(describeEpisode(11, '第十二集')).toEqual({ number: 12, label: '第12集' });
    expect(describeEpisode(200, '第两百零一集')).toEqual({ number: 201, label: '第201集' });
  });

  it('preserves original offset numbering after a filtered episode', () => {
    expect(describeEpisode(1, '第03集')).toEqual({ number: 2, title: '第03集', label: '第2集 · 第03集' });
    expect(describeEpisode(0, '第0集').title).toBe('第0集');
    expect(describeEpisode(0, '02').title).toBe('02');
  });

  it('does not mistake specials, quality labels or dated programmes for redundant numbering', () => {
    for (const title of ['特辑', '预告', '正片', 'HD', '1080P', '20260101期', 'SP01', '上集']) {
      expect(describeEpisode(0, title).title).toBe(title);
    }
  });

  it('falls back to numbering for legacy or missing titles without inventing a title', () => {
    expect(describeEpisode(2)).toEqual({ number: 3, label: '第3集' });
    expect(describeEpisode(2, '   ')).toEqual({ number: 3, label: '第3集' });
    expect(hasEpisodeTitles(undefined, 3)).toBe(false);
    expect(hasEpisodeTitles(['01', '', '第03集'], 3)).toBe(false);
    expect(hasEpisodeTitles(['01', '第二集的故事'], 2)).toBe(true);
    expect(hasEpisodeTitles(['01', '第二集的故事'], 1)).toBe(false);
  });

  it('preserves long titles, punctuation and literal markup for React to escape as text', () => {
    const title = '特别篇：<b>一家人</b> & A/B，长标题'.repeat(12);
    expect(describeEpisode(0, title).title).toBe(title);
  });
});
