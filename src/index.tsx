import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable, FieldType, ITextField, ITextFieldMeta, IOpenSegment } from '@lark-base-open/js-sdk';
import { Button, Select, Spin, Empty, message } from 'antd';
import {marked} from 'marked';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LoadApp/>
  </React.StrictMode>
)

function LoadApp() {
  const [loading, setLoading] = useState(true);
  const [markdownFieldMetaList, setMetaList] = useState<ITextFieldMeta[]>([])
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [renderedHTML, setRenderedHTML] = useState<string>('');
  const [tableInstance, setTableInstance] = useState<any>(null);
  const [lastPreviewedCell, setLastPreviewedCell] = useState<{recordId: string, fieldId: string} | null>(null);
  
  // 自动检测Markdown标记
  const autoDetectMarkdown = true;

  useEffect(() => {
    const fn = async () => {
      try {
        setLoading(true);
        const table = await bitable.base.getActiveTable();
        setTableInstance(table);
        
        // Get all text fields - we'll treat these as potential markdown fields
        const fieldMetaList = await table.getFieldMetaListByType<ITextFieldMeta>(FieldType.Text);
        setMetaList(fieldMetaList);
        
        if (fieldMetaList.length === 0) {
          message.warning('当前表格中没有文本字段，请先创建文本字段');
        } else {
          // message.success('点击任意单元格查看Markdown预览');
        }
        
        // 设置选择变化监听器
        const unsubscribe = bitable.base.onSelectionChange(async (event) => {
          try {
            // 获取当前选择
            const selection = await bitable.base.getSelection();
            if (!selection) return;
            
            // 获取选择的记录ID和字段ID
            const recordId = selection.recordId;
            const fieldId = selection.fieldId;
            
            if (!recordId || !fieldId) {
              return;
            }
            
            // 获取字段类型信息
            const fieldMeta = await table.getFieldMetaById(fieldId);
            if (!fieldMeta) return;
            
            // 检查是否是文本字段
            if (fieldMeta.type === FieldType.Text) {
              // 加载单元格内容并预览
              await loadCellContentAndPreview(table, recordId, fieldId);
            } else {
              // 非文本字段，显示提示
              setRenderedHTML('<div style="text-align: center; padding: 20px; color: #999;">当前单元格不是文本字段，无法预览Markdown</div>');
            }
          } catch (error) {
            console.error('Error handling selection change:', error);
            setRenderedHTML(`<div style="color: red; padding: 10px; border: 1px solid #ffaaaa; background: #fff0f0;">
              处理单元格选择变化时出错: ${error}
            </div>`);
          }
        });
        
        // 尝试获取初始选择并预览
        try {
          const initialSelection = await bitable.base.getSelection();
          if (initialSelection && initialSelection.recordId && initialSelection.fieldId) {
            const fieldMeta = await table.getFieldMetaById(initialSelection.fieldId);
            if (fieldMeta && fieldMeta.type === FieldType.Text) {
              await loadCellContentAndPreview(table, initialSelection.recordId, initialSelection.fieldId);
            }
          }
        } catch (error) {
          console.error('Error handling initial selection:', error);
        }
        
        setLoading(false);
        
        // 清理函数
        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing:', error);
        message.error('初始化失败，请刷新页面重试');
        setLoading(false);
      }
    };
    fn();
  }, []);

  // Convert IOpenSegment[] to string
  const segmentsToString = (segments: IOpenSegment[] | null | undefined): string => {
    if (!segments || segments.length === 0) return '';
    
    return segments.map(segment => {
      if (segment.type === 'text') {
        return segment.text;
      } else if (segment.type === 'url') {
        return segment.text;
      } else if (segment.type === 'mention') {
        return segment.text;
      }
      return '';
    }).join('');
  };

  // Check if content looks like markdown
  const looksLikeMarkdown = (content: string): boolean => {
    if (!content) return false;
    
    // 检查是否包含常见的Markdown语法
    const markdownPatterns = [
      /#{1,6}\s+.+/,          // 标题
      /\*\*.+\*\*/,           // 粗体
      /\*.+\*/,               // 斜体
      /`[^`]+`/,              // 行内代码
      /```[\s\S]*?```/,       // 代码块
      /\[.+\]\(.+\)/,         // 链接
      /!\[.+\]\(.+\)/,        // 图片
      /^\s*[-+*]\s+.+/m,      // 无序列表
      /^\s*\d+\.\s+.+/m,      // 有序列表
      /^\s*>.+/m,             // 引用
      /\|\s*[-:]+\s*\|/,      // 表格分割线
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  };

  // Load cell content and preview if it contains markdown
  const loadCellContentAndPreview = async (table: any, recordId: string, fieldId: string) => {
    try {
      setLoading(true);
      
      // 如果是重复的单元格，避免重复加载
      if (lastPreviewedCell && 
          lastPreviewedCell.recordId === recordId && 
          lastPreviewedCell.fieldId === fieldId) {
        setLoading(false);
        return;
      }
      
      // 获取单元格的值
      const field = await table.getField(fieldId);
      const value = await field.getValue(recordId);
      
      // 处理不同类型的返回值
      let content = '';
      if (Array.isArray(value)) {
        content = segmentsToString(value);
      } else if (typeof value === 'string') {
        content = value;
      } else if (value) {
        content = String(value);
      }
      
      // 如果内容为空，则显示提示
      if (!content) {
        setRenderedHTML('<div style="text-align: center; padding: 20px; color: #999;">当前单元格内容为空</div>');
        setLoading(false);
        setLastPreviewedCell({recordId, fieldId});
        return;
      }
      
      // 检查内容是否像Markdown
      if (autoDetectMarkdown && !looksLikeMarkdown(content)) {
        setRenderedHTML(`
          <div style="text-align: center; padding: 10px; color: #999; margin-bottom: 10px;">
            当前单元格内容可能不是Markdown格式
          </div>
          <div style="padding: 10px; border: 1px solid #d9d9d9; border-radius: 4px;">
            ${content.replace(/\n/g, '<br>')}
          </div>
        `);
        setLoading(false);
        setLastPreviewedCell({recordId, fieldId});
        return;
      }
      
      setMarkdownContent(content);
      
      // 渲染Markdown
      try {
        const result = marked(content);
        if (typeof result === 'string') {
          setRenderedHTML(result);
        } else if (result instanceof Promise) {
          const html = await result;
          setRenderedHTML(html);
        }
      } catch (error) {
        console.error('Error rendering markdown:', error);
        setRenderedHTML(`<div style="color: red; padding: 10px; border: 1px solid #ffaaaa; background: #fff0f0;">
          渲染Markdown内容时出错: ${error}
        </div><pre>${content}</pre>`);
      }
      
      // 记录最后预览的单元格
      setLastPreviewedCell({recordId, fieldId});
      setLoading(false);
    } catch (error) {
      console.error('Error loading cell content:', error);
      setRenderedHTML(`<div style="color: red; padding: 10px; border: 1px solid #ffaaaa; background: #fff0f0;">
        加载单元格内容时出错: ${error}
      </div>`);
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '0 16px 16px 16px' }}>
      <h2>Markdown预览</h2>
      
      <div style={{ marginBottom: '8px', color: '#666', fontSize: '14px' }}>
        点击任意文本单元格以预览其Markdown内容
      </div>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin tip="加载中..." />
        </div>
      ) : (
        <div>
          <div 
            className="markdown-preview"
            style={{ 
              border: '1px solid #d9d9d9', 
              borderRadius: '4px', 
              padding: '16px',
              minHeight: '200px',
              backgroundColor: '#fff',
              overflow: 'auto'
            }}
            dangerouslySetInnerHTML={{ __html: renderedHTML || '<div style="text-align: center; padding: 40px; color: #999;">点击包含Markdown的单元格查看预览</div>' }}
          />
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#999', textAlign: 'right' }}>
            提示: 点击任意文本单元格即可实时预览
          </div>
        </div>
      )}
    </div>
  );
}