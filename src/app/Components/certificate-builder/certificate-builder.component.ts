interface NamedTextbox extends fabric.Textbox {
  name?: string;
}
import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  HostListener,
} from '@angular/core';
import * as fabric from 'fabric';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TEvent, TPointerEvent } from 'fabric';

type CanvasPointerEvent = TEvent<TPointerEvent>;
type CanvasSelectEvent = CanvasPointerEvent & { target?: fabric.Object };
@Component({
  selector: 'app-certificate-builder',
  standalone: true,
  imports: [NgIf, FormsModule, NgFor],
  templateUrl: './certificate-builder.component.html',
  styleUrl: './certificate-builder.component.css',
})
export class CertificateBuilderComponent implements AfterViewInit, OnDestroy {
  selectedCoords = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  uploadedData: any[] = [];
  dragOver = false;
  copiedObject: fabric.Object | null = null;
  activeTextbox: fabric.Textbox | null = null;

  fontFamilies = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Courier New',
    'Verdana',
  ];
  textColor = '#000000';
  uiFontSize = 24;

  @ViewChild('htmlCanvas', { static: false }) htmlCanvas!: ElementRef;
  canvas!: fabric.Canvas;
  isShiftPressed: boolean = false;

  ngAfterViewInit(): void {
    let isDragging = false;
    let lastPosX = 0;
    let lastPosY = 0;
    this.canvas = new fabric.Canvas(this.htmlCanvas.nativeElement, {
      width: 900,
      height: 700,
      backgroundColor: '#ccc',
      preserveObjectStacking: true,
    });
    // Add keyboard event Listener
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') this.isShiftPressed = false;
    });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const obj = this.canvas.getActiveObject();
      if (obj) {
        let moved = false;
        const step = e.shiftKey ? 5 : 1;
        switch (e.key) {
          case 'ArrowUp':
            obj.top = (obj.top ?? 0) - step;
            moved = true;
            break;
          case 'ArrowDown':
            obj.top = (obj.top ?? 0) + step;
            moved = true;
            break;
          case 'ArrowLeft':
            obj.left = (obj.left ?? 0) - step;
            moved = true;
            break;
          case 'ArrowRight':
            obj.left = (obj.left ?? 0) + step;
            moved = true;
            break;
        }

        if (moved) {
          obj.setCoords(); // Updates internal coordinates
          this.canvas.requestRenderAll(); // Triggers re-render
          this.updateCoords(obj); // Updates your coordinate box
          e.preventDefault(); // Prevents page scroll
        }
      }
    });

    this.canvas.on('selection:created', this.updateCoords.bind(this));
    this.canvas.on('selection:updated', this.updateCoords.bind(this));
    this.canvas.on('object:modified', this.updateCoords.bind(this));
    this.canvas.on('object:moving', this.updateCoords.bind(this));
    this.canvas.on('object:scaling', this.updateCoords.bind(this));
    this.canvas.on('object:scaling', (e) =>
      this.handleTextboxScaling(e.target)
    );
    this.canvas.on('object:modified', (e) => this.syncUiFontSize(e.target));
    this.canvas.on('selection:created', (e) => {
      this.onSelection(e as unknown as CanvasSelectEvent);
    });
    this.canvas.on('selection:updated', (e) => {
      this.onSelection(e as unknown as CanvasPointerEvent);
    });
    this.canvas.on(
      'before:selection:cleared',
      () => (this.activeTextbox = null)
    );
    this.canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;

      // clamp zoom level
      if (zoom > 5) zoom = 5;
      if (zoom < 0.2) zoom = 0.2;
      // Zoom relative to cursor position
      const zoompoint = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
      this.canvas.zoomToPoint(zoompoint, zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });
    this.canvas.on('mouse:down', (opt) => {
      const evt = opt.e as MouseEvent;

      if (evt.button === 2 || this.isShiftPressed) {
        isDragging = true;
        this.canvas.selection = false;
        lastPosX = evt.clientX;
        lastPosY = evt.clientY;
        this.htmlCanvas.nativeElement.style.cursor = 'grabbing';
      }
    });
    this.canvas.on('mouse:move', (opt) => {
      if (isDragging) {
        const e = opt.e as MouseEvent;
        const vpt = this.canvas.viewportTransform!;
        vpt[4] += e.clientX - lastPosX;
        vpt[5] += e.clientY - lastPosY;
        this.canvas.requestRenderAll();
        lastPosX = e.clientX;
        lastPosY = e.clientY;
      }
    });
    this.canvas.on('mouse:up', () => {
      isDragging = false;
      this.canvas.selection = true;
      this.htmlCanvas.nativeElement.style.cursor = 'default';
    });
  }
  // keep UI in sync helper
  private syncUiFontSize(obj: fabric.Object | undefined) {
    if (obj?.type === 'textbox') {
      this.uiFontSize = (obj as fabric.Textbox).fontSize as number;
    }
  }

  private handleTextboxScaling(obj: fabric.Object | undefined) {
    if (obj?.type === 'textbox') {
      const textbox = obj as fabric.Textbox;
      // Store original width to check if it needs adjustment
      const originalWidth = textbox.width || 100;
      const originalFontSize = textbox.fontSize || 16;
      const scale = textbox.scaleX || 1; // Assume uniform scaling
      const newFontSize = Math.round(originalFontSize * scale);

      // Update fontSize and reset scale
      textbox.set({
        fontSize: newFontSize,
        scaleX: 1,
        scaleY: 1,
      });

      // Recalculate dimensions to fit content
      textbox.initDimensions();

      // Calculate the natural content width
      const contentWidth = textbox.calcTextWidth(); // Get width of text content
      console.log("content width: ",contentWidth);
      textbox.set({
        width: Math.max(contentWidth, 100), // Ensure minimum width
      });

      // Update coordinates and invalidate cache
      textbox.setCoords();
      textbox.dirty = true;
      (textbox as any)._clearCache?.();

      // Sync UI
      this.uiFontSize = newFontSize;

      // Render canvas
      this.canvas.renderAll();
    }
  }

  // onSelection
  private onSelection(evt?: any) {
    // const obj = eventOrObject?.target ?? eventOrObject;
    let obj: fabric.Object | undefined = evt.target;

    // 2️⃣  multi‑object selection events (selection:created / updated)
    if (!obj && Array.isArray(evt.selected) && evt.selected.length) {
      obj = evt.selected[0];
    }
    console.log('e: ', obj);
    // const obj = e.target as fabric.Object | undefined;
    if (obj && obj.type === 'textbox') {
      this.activeTextbox = obj as fabric.Textbox;
      console.log('activeTextBox: ', this.activeTextbox);
      this.textColor = (this.activeTextbox.fill as string) ?? '#000000';
    } else {
      this.activeTextbox = null;
    }
  }
  applyFontSize(size: number) {
    if (!this.activeTextbox) return;
    // this.activeTextbox.fontSize = +size;
    this.activeTextbox.set({
      fontSize: +size,
      scaleX: 1, // Reset scale to avoid compounding
      scaleY: 1,
    });
    this.activeTextbox.initDimensions();
      // Adjust width to content
      const contentWidth = this.activeTextbox.calcTextWidth();
      this.activeTextbox.set({
        width: Math.max(contentWidth, 100)
      });
    this.activeTextbox.setCoords();
    this.activeTextbox.dirty = true;
    (this.activeTextbox as any)._clearCache?.();
    this.canvas.requestRenderAll();
    this.uiFontSize = +size;
  }

  applyTextChange() {
    if (!this.activeTextbox) return;
    if (this.activeTextbox) {
      this.activeTextbox.set({
        fontFamily: this.activeTextbox.fontFamily,
        // fontSize: this.activeTextbox.fontSize,
        scaleX: 1,
        scaleY: 1,
      });
      this.activeTextbox.initDimensions();
      // Adjust width to content
      const contentWidth = this.activeTextbox.calcTextWidth();
      this.activeTextbox.set({
        width: Math.max(contentWidth, 100),
      });
      this.activeTextbox.setCoords(); // Update coordinates
      this.activeTextbox.dirty = true;
      (this.activeTextbox as any)._clearCache();
      // this.waitForRender();
      this.canvas.renderAll();
      // this.syncUiFontSize(this.activeTextbox);
    }
  }

  /* Apply colour */
  applyTextColor() {
    if (!this.activeTextbox) return;
    this.activeTextbox.set({
      fill: this.textColor,
      scaleX: 1, // Reset scale
      scaleY: 1,
    });
    this.activeTextbox.initDimensions();
    this.activeTextbox.setCoords();
    this.activeTextbox.dirty = true;
    (this.activeTextbox as any)._clearCache?.();
    this.canvas.renderAll();
  }

  /* Toggle bold / italic */
  toggleStyle(style: 'bold' | 'italic') {
    if (!this.activeTextbox) {
      return;
    }

    if (style === 'bold') {
      const newWeight =
        this.activeTextbox.fontWeight === 'bold' ? 'normal' : 'bold';
      this.activeTextbox.set('fontWeight', newWeight);
    } else {
      const newStyle =
        this.activeTextbox.fontStyle === 'italic' ? 'normal' : 'italic';
      this.activeTextbox.set('fontStyle', newStyle);
    }
    this.activeTextbox.initDimensions();
    this.activeTextbox.setCoords();
    this.activeTextbox.dirty = true;
    (this.activeTextbox as any)._clearCache?.();
    this.canvas.renderAll();
    // this.canvas.requestRenderAll();
  }

  @HostListener('contextmenu', ['$event'])
  onRightClick(event: MouseEvent) {
    event.preventDefault();
  }

  async handleKeyDown(event: KeyboardEvent) {
    const activeObject = this.canvas.getActiveObject();

    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      // copy
      if (activeObject) {
        this.copiedObject = await activeObject.clone();
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      // paste
      if (this.copiedObject) {
        const cloned = await this.copiedObject.clone();
        cloned.set({
          left: (cloned.left ?? 0) + 10,
          top: (cloned.top ?? 0) + 10,
          borderColor: 'green',
          cornerColor: 'black',
          cornerSize: 10,
          cornerStyle: 'circle',
          transparentCorners: false,
          borderScaleFactor: 2,
          evented: true,
        });
        this.canvas.add(cloned);
        this.canvas.setActiveObject(cloned);
        this.canvas.requestRenderAll();
      }
    }

    // For Delete request
    if (event.key === 'Delete') {
      if (activeObject) {
        this.canvas.remove(activeObject);
        this.canvas.discardActiveObject();
        this.canvas.requestRenderAll();
      }
    }
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault(); // Allow dropping
    this.dragOver = true;
  }
  onDragLeave(event: DragEvent) {
    this.dragOver = false;
  }
  onDrop(event: DragEvent) {
    this.dragOver = false;
    this.setCertificateBackground(event, true);
  }

  updateCoords(eventOrObject?: any) {
    const obj = eventOrObject?.target ?? eventOrObject;
    if (obj) {
      this.selectedCoords = {
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.getScaledWidth?.() ?? obj.width ?? 0),
        height: Math.round(obj.getScaledHeight?.() ?? obj.height ?? 0),
      };
    }
  }

  // set certificate image as background
  async setCertificateBackground(
    event: any,
    fromDrop: boolean = false
  ): Promise<void> {
    event.preventDefault();
    let file: File | null = null;
    if (fromDrop && event.dataTransfer?.files?.[0]) {
      file = event.dataTransfer?.files[0];
    } else if (event.target?.files?.[0]) {
      file = event.target.files[0];
    }
    if (!file || !file.type.startsWith('image/')) {
      alert('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();

    reader.onload = async (f: ProgressEvent<FileReader>) => {
      const url = f.target?.result as string;
      fabric.Image.fromURL(url).then((img: fabric.Image) => {
        const canvasWidth = this.canvas.getWidth();
        const canvasHeight = this.canvas.getHeight();
        const imgOriginalWidth = img.width!;
        const imgOriginalHeight = img.height!;
        // Maintain aspect ratio
        const scale = canvasHeight / imgOriginalHeight;
        const scaleWidth = imgOriginalWidth * scale;
        // const scaleX = canvasWidth/img.width!;
        // const scaleY = canvasHeight/img.height!;

        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (canvasWidth - scaleWidth) / 2,
          selectable: false,
          evented: false,
        });
        if (this.canvas.backgroundImage) {
          this.canvas.backgroundImage = undefined;
        }
        this.canvas.set('backgroundImage', img);
        // this.canvas.backgroundImage = img;
        this.canvas.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }

  addField(fieldType: 'username' | 'date' | 'body'): void {
    let defaultText = '';
    let width = 100;
    let fontSize = 24;

    if (fieldType === 'username') defaultText = 'UserName';
    else if (fieldType === 'date') defaultText = 'DD/MM/YYYY';
    else if (fieldType === 'body') {
      defaultText = 'This is to certify that...';
      width: 400;
      fontSize = 18;
    }
    const textbox = new fabric.Textbox(defaultText, {
      left: 100,
      top: 100,
      width,
      fontSize,
      editable: true,
      transparentCorners: false,
      lockUniScaling: false,
      name: fieldType,
    }) as NamedTextbox;
    textbox.name = fieldType;
    textbox.set({
      borderColor: 'green',
      cornerColor: 'black',
      cornerSize: 10,
      cornerStyle: 'circle',
      borderScaleFactor: 2,
    });
    this.canvas.add(textbox);
    this.canvas.setActiveObject(textbox);
    this.canvas.bringObjectForward(textbox);
  }
  addImage(event: any, type: 'logo' | 'signature'): void {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (f: any) => {
      const url = f.target.result;
      fabric.Image.fromURL(url).then((img: fabric.Image) => {
        img.set({
          left: 150,
          top: 150,
          scaleX: 0.4,
          scaleY: 0.4,
          // borderColor:'gray',
          // cornerColor:'blue',
          transparentCorners: false,
          lockUniScaling: true,
          name: type,
          borderColor: 'green',
          cornerColor: 'black',
          cornerSize: 10,
          cornerStyle: 'circle',
          borderScaleFactor: 2,
        });
        this.canvas.add(img);
        this.canvas.setActiveObject(img);
        this.canvas.bringObjectForward(img);
      });
    };
    reader.readAsDataURL(file);
  }

  download(): void {
    const dataURL = this.canvas.toDataURL({ format: 'png', multiplier: 1 });
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'certificate.png';
    link.click();
  }

  updateCanvasFields(rowData: any) {
    this.canvas.getObjects().forEach((obj) => {
      const namedTextbox = obj as NamedTextbox;
      if (obj.type === 'textbox' && namedTextbox.name) {
        const fieldName = namedTextbox.name;

        if (rowData[fieldName] !== undefined) {
          let text = rowData[fieldName];
          if (fieldName === 'date' && typeof rowData[fieldName] === 'number') {
            const jsDate = XLSX.SSF.parse_date_code(rowData[fieldName]);
            // utilities from xlsx
            text = `${jsDate.y}-${String(jsDate.m).padStart(2, '0')}-${String(
              jsDate.d
            ).padStart(2, '0')}`;
          }
          namedTextbox.set({ text: text });
          namedTextbox.initDimensions();
          namedTextbox.setCoords();
          namedTextbox.dirty = true;
          console.log('Updated:', fieldName, 'to', rowData[fieldName]);
        }
      }
    });
    this.canvas.requestRenderAll();
  }

  canvasToJpeg(canvas: fabric.Canvas, scale = 1, quality = 0.8) {
    return canvas.toDataURL({
      format: 'jpeg' as const, // JPEG!
      multiplier: scale, // 1 = 900×700 → ~200 KB
      quality, // 0‑1, tweak until it looks good
    });
  }
  async exportCanvasToPDF(filename: string) {
    await this.waitForRender();
    const dataUrl = this.canvasToJpeg(this.canvas, 1, 1);

    const pdf = new jsPDF({
      orientation:
        this.canvas.width > this.canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [this.canvas.width, this.canvas.height],
      compress: true,
    });
    pdf.addImage(
      dataUrl,
      'JPEG',
      0,
      0,
      this.canvas.width,
      this.canvas.height,
      undefined,
      'FAST'
    );
    pdf.save(filename);
  }
  // generate one multi-page PDF
  async generateCertificateBatchPDF() {
    if (!this.uploadedData?.length) {
      alert('Please upload Excel data first');
      return;
    }
    // create an empty, landscape PDF, enable compression
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [900, 700],
      compress: true,
    });
    for (let i = 0; i < this.uploadedData.length; i++) {
      const row = this.uploadedData[i];
      // Update the textbox on canvas
      this.waitForRender();
      this.updateCanvasFields(row);
      await this.waitForRender();

      // get JPEG snapshot
      const img = this.canvasToJpeg(this.canvas, 1, 0.85);

      // add to pdf
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, 900, 700, undefined, 'FAST');
    }
    // Download once at the end
    pdf.save(`certificates_batch_${this.uploadedData.length}.pdf`);
  }

  async generateCertificates() {
    if (!this.uploadedData || this.uploadedData.length === 0) {
      alert('Please upload Excel data first');
      return;
    }
    for (let i = 0; i < this.uploadedData.length; i++) {
      const row = this.uploadedData[i];

      this.updateCanvasFields(row);
      await this.waitForRender();
      await this.exportCanvasToPDF(`certificate_${i + 1}.pdf`);
    }
  }

  waitForRender(): Promise<void> {
    return new Promise((resolve) => {
      this.canvas.requestRenderAll();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }
  // Excel file handler
  onExcelUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      this.uploadedData = XLSX.utils.sheet_to_json(worksheet);
      console.log('Parsed Excel Data:', this.uploadedData);
      alert(`Loaded ${this.uploadedData.length} rows`);
    };
    reader.readAsArrayBuffer(file);
  }
  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
  }
}
