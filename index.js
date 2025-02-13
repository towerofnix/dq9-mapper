// Platinum Ruins of Regret Lv. 68

'use strict'

const {
  readFile,
  writeFile,
  readdir,
  stat,
} = require('fs/promises')

const naturalSort = require('node-natural-sort')
const path = require('path')

const {
  ui: {
    controls: {
      Button,
      Form,
      ListScrollForm,
      TextInput,
    },

    dialogs: {
      CancelDialog,
      Dialog,
    },

    presentation: {
      Label,
      Pane,
    },

    primitives: {
      DisplayElement,
      FocusElement,
      Root,
    },
  },

  util: {
    ansi,

    telchars: telc,
    unichars: unic,

    interfaces: {
      CommandLineInterface,
      Flushable,
    },
  },
} = require('tui-lib')

process.on('unhandledRejection', error => {
  console.error(error.stack)
  process.exit(1)
})

class MapCanvas extends FocusElement {
  constructor() {
    super()

    this.tiles = [
      {x: 0, y: 0, up: true, left: true, down: true, right: false},
      {x: 0, y: 1, up: true, left: false, down: false, right: true},
      {x: 1, y: 1, up: false, left: true, down: false, right: false, label: 'A'},
      {x: -1, y: 0, up: false, left: true, down: true, right: true, label: unic.ARROW_UP}
    ]

    this.scrollX = 0
    this.scrollY = 0
    this.selectedX = 0
    this.selectedY = 0

    this.commentPane = new Pane()
    this.commentPane.visible = false
    this.addChild(this.commentPane)

    this.commentLabel = new Label('(Tile comment)')
    this.commentPane.addChild(this.commentLabel)
  }

  fixLayout() {
    this.commentPane.w = Math.min(52, this.contentW)
    this.commentPane.h = 3
    this.commentPane.centerInParent()
    this.commentPane.y = this.contentH - 3

    this.commentLabel.centerInParent()
    this.commentLabel.y = 0
  }

  tilePosVisibleX(tileX) {
    return tileX >= this.scrollX && tileX - this.scrollX < Math.floor(this.contentW / 3)
  }

  tilePosVisibleY(tileY) {
    return tileY >= this.scrollY && tileY - this.scrollY < Math.floor(this.contentH / 3)
  }

  tilePosVisible(tileX, tileY) {
    return this.tilePosVisibleX(tileX) && this.tilePosVisibleY(tileY)
  }

  moveCursorToTilePos(tileX, tileY, rowOffset = 0) {
    return ansi.moveCursor(
      this.absTop + 3 * (tileY - this.scrollY) + rowOffset,
      this.absLeft + 3 * (tileX - this.scrollX)
    )
  }

  drawTo(writable) {
    this.keepSelectionInScreen()

    for (const tile of this.tiles) {
      if (!this.tilePosVisible(tile.x, tile.y)) {
        continue
      }

      let characters = [[' ',' ',' '],[' ',' ',' '],[' ',' ',' ']]
      if (tile.up) {
        if (tile.left) {
          characters[0][0] = unic.BOX_CORNER_BR
        } else {
          characters[0][0] = unic.BOX_V
        }
        if (tile.right) {
          characters[0][2] = unic.BOX_CORNER_BL
        } else {
          characters[0][2] = unic.BOX_V
        }
      } else {
        if (tile.left) {
          characters[0][0] = unic.BOX_H
        } else {
          characters[0][0] = unic.BOX_CORNER_TL
        }
        if (tile.right) {
          characters[0][2] = unic.BOX_H
        } else {
          characters[0][2] = unic.BOX_CORNER_TR
        }
      }
      if (tile.down) {
        if (tile.left) {
          characters[2][0] = unic.BOX_CORNER_TR
        } else {
          characters[2][0] = unic.BOX_V
        }
        if (tile.right) {
          characters[2][2] = unic.BOX_CORNER_TL
        } else {
          characters[2][2] = unic.BOX_V
        }
      } else {
        if (tile.left) {
          characters[2][0] = unic.BOX_H
        } else {
          characters[2][0] = unic.BOX_CORNER_BL
        }
        if (tile.right) {
          characters[2][2] = unic.BOX_H
        } else {
          characters[2][2] = unic.BOX_CORNER_BR
        }
      }
      if (!tile.up) {
        characters[0][1] = unic.BOX_H
      }
      if (!tile.down) {
        characters[2][1] = unic.BOX_H
      }
      if (!tile.left) {
        characters[1][0] = unic.BOX_V
      }
      if (!tile.right) {
        characters[1][2] = unic.BOX_V
      }
      if (tile.label) {
        characters[1][1] = tile.label
      }

      const selected = tile.x === this.selectedX && tile.y === this.selectedY

      if (selected) {
        writable.write(ansi.invert())
      }

      const top = this.absTop + 3 * (tile.y - this.scrollY)
      const left = this.absLeft + 3 * (tile.x - this.scrollX)

      for (let i = 0; i <= 2; i++) {
        writable.write(this.moveCursorToTilePos(tile.x, tile.y, i))
        writable.write(characters[i].join(''))
      }

      if (selected) {
        writable.write(ansi.invertOff())
      }
    }

    if (!this.selectedTile) {
      writable.write(ansi.invert())
      for (let i = 0; i <= 2; i++) {
        writable.write(this.moveCursorToTilePos(this.selectedX, this.selectedY, i))
        writable.write('   ')
      }
      writable.write(ansi.invertOff())
    }

    if (this.selectedTile && this.selectedTile.comment) {
      this.commentLabel.text = this.selectedTile.comment
      this.commentPane.visible = true
      this.fixLayout()
    } else {
      this.commentPane.visible = false
    }
  }

  keyPressed(keyBuf) {
    if (telc.isUp(keyBuf)) {
      this.selectedY--
    } else if (telc.isDown(keyBuf)) {
      this.selectedY++
    } else if (telc.isLeft(keyBuf)) {
      this.selectedX--
    } else if (telc.isRight(keyBuf)) {
      this.selectedX++
    } else if (telc.isShiftUp(keyBuf) || keyBuf.toString() === 'w') {
      this.createSelectedTile()
      this.selectedTile.up = !this.selectedTile.up
      this.scheduleDrawWithoutPropertyChange()
    } else if (telc.isShiftDown(keyBuf) || keyBuf.toString() === 's') {
      this.createSelectedTile()
      this.selectedTile.down = !this.selectedTile.down
      this.scheduleDrawWithoutPropertyChange()
    } else if (telc.isShiftLeft(keyBuf) || keyBuf.toString() === 'a') {
      this.createSelectedTile()
      this.selectedTile.left = !this.selectedTile.left
      this.scheduleDrawWithoutPropertyChange()
    } else if (telc.isShiftRight(keyBuf) || keyBuf.toString() === 'd') {
      this.createSelectedTile()
      this.selectedTile.right = !this.selectedTile.right
      this.scheduleDrawWithoutPropertyChange()
    } else if (telc.isSelect(keyBuf)) {
      this.createSelectedTile()
      this.scheduleDrawWithoutPropertyChange()
    } else if (telc.isBackspace(keyBuf) || keyBuf.toString() === 'x') {
      if (this.selectedTile) {
        if (this.selectedTile.label) {
          this.selectedTile.label = ''
        } else if (this.selectedTile.comment) {
          this.selectedTile.comment = ''
        } else {
          this.tiles.splice(this.tiles.indexOf(this.selectedTile), 1)
        }
        this.scheduleDrawWithoutPropertyChange()
      }
    } else if (keyBuf[0] === 'l'.charCodeAt(0)) {
      this.createSelectedTile()
      const tile = this.selectedTile
      this.emit('requestLabel')
      this.once('gotLabel', label => {
        tile.label = label
        this.root.select(this)
      })
    } else if (keyBuf[0] === '/'.charCodeAt(0)) {
      this.createSelectedTile()
      const tile = this.selectedTile
      this.emit('requestComment')
      this.once('gotComment', comment => {
        tile.comment = comment
        this.root.select(this)
      })
    } else {
      super.keyPressed(keyBuf)
    }
  }

  createSelectedTile() {
    if (!this.selectedTile) {
      this.tiles.push({x: this.selectedX, y: this.selectedY, up: true, down: true, left: true, right: true, label: ''})
    }
  }

  keepSelectionInScreen() {
    if (this.selectedX < this.scrollX) {
      this.scrollX = this.selectedX
    }
    if (this.selectedY < this.scrollY) {
      this.scrollY = this.selectedY
    }
    if (!this.tilePosVisibleX(this.selectedX)) {
      this.scrollX = this.selectedX - Math.floor(this.contentW / 3) + 1
    }
    if (!this.tilePosVisibleY(this.selectedY)) {
      this.scrollY = this.selectedY - Math.floor(this.contentH / 3) + 1
    }
  }

  get selectedTile() {
    return this.tiles.find(({ x, y }) => x === this.selectedX && y === this.selectedY)
  }

  get scrollX() { return this.getDep('scrollX') }
  set scrollX(v) { return this.setDep('scrollX', v) }
  get scrollY() { return this.getDep('scrollY') }
  set scrollY(v) { return this.setDep('scrollY', v) }
  get selectedX() { return this.getDep('selectedX') }
  set selectedX(v) { return this.setDep('selectedX', v) }
  get selectedY() { return this.getDep('selectedY') }
  set selectedY(v) { return this.setDep('selectedY', v) }
}

class MapLabelDialog extends Dialog {
  constructor() {
    super()

    this.form = new ListScrollForm()
    this.pane.addChild(this.form)

    this.label = new Label('Label:')
    this.pane.addChild(this.label)

    for (const item of [
      [' ', 'No label'],
      [unic.ARROW_UP, 'Stairs - Up'],
      [unic.ARROW_DOWN, 'Stairs - Down'],
      ['C', 'Chest - ?? Rank'],
      ['1', 'Chest - Rank 1'],
      ['2', 'Chest - Rank 2'],
      ['3', 'Chest - Rank 3'],
      ['4', 'Chest - Rank 4'],
      ['5', 'Chest - Rank 5'],
      ['6', 'Chest - Rank 6'],
      ['7', 'Chest - Rank 7'],
      ['8', 'Chest - Rank 8'],
      ['9', 'Chest - Rank 9'],
      ['X', 'Chest - Rank 10'],
    ]) {
      const button = new Button(`${item[0]} (${item[1]})`)

      button.on('pressed', () => {
        this.emit('selected', item[0])
      })

      this.form.addInput(button)
    }
  }

  fixLayout() {
    super.fixLayout()

    this.pane.w = 22
    this.pane.h = 10
    this.pane.centerInParent()

    this.label.centerInParent()
    this.label.y = 0

    this.form.x = 0
    this.form.y = 1
    this.form.w = this.pane.contentW
    this.form.h = this.pane.contentH - 1
  }

  focused() {
    this.root.select(this.form)
  }

  selectLabel(label) {
    this.form.curIndex = 0

    for (let i = 0; i < this.form.inputs.length; i++) {
      const button = this.form.inputs[i]
      if (button.text[0] === label) {
        this.form.curIndex = i
        break
      }
    }
  }
}

class MapCommentDialog extends Dialog {
  constructor() {
    super()

    this.label = new Label('Comment:')
    this.pane.addChild(this.label)

    this.textInput = new TextInput()
    this.pane.addChild(this.textInput)

    this.textInput.on('value', value => {
      this.emit('entered', value)
    })
  }

  fixLayout() {
    super.fixLayout()

    this.pane.w = Math.min(40, this.contentW)
    this.pane.h = 3
    this.pane.centerInParent()

    this.label.x = 1
    this.label.y = 0

    this.textInput.x = this.label.right + 1
    this.textInput.y = this.label.y
    this.textInput.w = this.pane.contentW - this.label.x
  }

  setComment(comment) {
    if (!comment) {
      comment = ''
    }

    this.textInput.value = comment
    this.textInput.cursorIndex = comment.length
    this.textInput.keepCursorInRange()
  }

  focused() {
    this.root.select(this.textInput)
  }
}

class FilePickerForm extends ListScrollForm {
  fillItems(dirPath) {
    this.inputs = []
    this.children = []

    const button = new Button('..Loading..')
    this.addInput(button)
    this.firstInput()

    readdir(dirPath).then(
      async items => {
        this.removeInput(button)

        const processedItems = await Promise.all(items.map(item => {
          const itemPath = path.resolve(dirPath, item)
          return stat(itemPath).then(s => {
            return {
              path: itemPath,
              label: item + (s.isDirectory() ? '/' : ''),
              isDirectory: s.isDirectory()
            }
          })
        }))

        const sort = naturalSort({
          properties: {
            caseSensitive: false
          }
        })
        processedItems.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) {
            return sort(a.label, b.label)
          } else {
            if (a.isDirectory) {
              return -1
            } else {
              return +1
            }
          }
        })

        processedItems.unshift({
          path: path.resolve(dirPath, '..'),
          label: '../',
          isDirectory: true
        })

        let y = 0
        for (const item of processedItems) {
          const itemButton = new Button(item.label)
          itemButton.y = y
          y++
          this.addInput(itemButton)

          itemButton.on('pressed', () => {
            if (item.isDirectory) {
              this.emit('browsingDirectory', item.path)
              this.fillItems(item.path)
            } else {
              this.emit('selected', item.path)
            }
          })
        }

        this.firstInput()
        this.fixLayout()
      },
      () => {
        button.text = 'Failed to read path! (Cancel)'
        button.on('pressed', () => {
          this.emit('canceled')
        })
      })
  }
}

class OpenFileDialog extends Dialog {
  constructor() {
    super()

    this.form = new Form()
    this.pane.addChild(this.form)

    this.filePathLabel = new Label('Enter file path:')
    this.filePathInput = new TextInput()
    this.openButton = new Button('Open')
    this.cancelButton = new Button('Cancel')

    this.filePickerForm = new FilePickerForm()
    this.filePickerForm.captureTab = false

    this.form.addChild(this.filePathLabel)
    this.form.addInput(this.filePathInput)
    this.form.addInput(this.filePickerForm)
    this.form.addInput(this.openButton)
    this.form.addInput(this.cancelButton)

    this._resolve = null

    this.openButton.on('pressed', () => {
      this._resolve(this.filePathInput.value)
    })

    this.filePathInput.on('value', () => {
      this._resolve(this.filePathInput.value)
    })

    {
      const cb = append => p => {
        this.filePathInput.setValue((path.relative(__dirname, p) || '.') + append)
      }

      this.filePickerForm.on('selected', cb(''))
      this.filePickerForm.on('browsingDirectory', cb('/'))
    }

    this.cancelButton.on('pressed', () => {
      this._resolve(null)
    })

    const dir = (this.lastFilePath
      ? path.relative(__dirname, path.dirname(this.lastFilePath)) + '/'
      : './')

    this.filePathInput.setValue(dir)
    this.filePickerForm.fillItems(dir)
  }

  fixLayout() {
    super.fixLayout()

    this.pane.w = Math.min(this.contentW, 40)
    this.pane.h = Math.min(this.contentH, 20)
    this.pane.centerInParent()

    this.form.w = this.pane.contentW
    this.form.h = this.pane.contentH

    this.filePathLabel.x = 0
    this.filePathLabel.y = 0

    this.filePathInput.x = this.filePathLabel.right + 2
    this.filePathInput.y = this.filePathLabel.y
    this.filePathInput.w = this.form.contentW - this.filePathInput.x

    this.filePickerForm.x = 0
    this.filePickerForm.y = this.filePathInput.y + 2
    this.filePickerForm.w = this.form.contentW
    this.filePickerForm.h = this.form.contentH - this.filePickerForm.y - 2

    this.openButton.x = 0
    this.openButton.y = this.form.contentH - 1

    this.cancelButton.x = this.openButton.right + 2
    this.cancelButton.y = this.openButton.y
  }

  focused() {
    this.form.firstInput()
  }

  go() {
    this.visible = true
    this.root.select(this)

    return new Promise(resolve => {
      this._resolve = resolve
    }).then(filePath => {
      this.visible = false
      this.lastFilePath = filePath
      return filePath
    })
  }
}

class AppElement extends FocusElement {
  constructor(saveFilePath = 'save.json') {
    super()

    this.pane = new Pane()
    this.addChild(this.pane)

    this.mapCanvas = new MapCanvas()
    this.pane.addChild(this.mapCanvas)

    this.editingFileLabel = new Label('(Loading)')
    this.pane.addChild(this.editingFileLabel)

    this.mapLabelDialog = new MapLabelDialog()
    this.mapLabelDialog.visible = false
    this.addChild(this.mapLabelDialog)

    this.mapCanvas.on('requestLabel', () => {
      this.mapLabelDialog.visible = true
      this.mapLabelDialog.selectLabel(this.mapCanvas.selectedTile.label)
      this.root.select(this.mapLabelDialog)
    })

    this.mapLabelDialog.on('selected', value => {
      this.mapLabelDialog.visible = false
      this.mapCanvas.emit('gotLabel', value)
    })

    this.mapLabelDialog.on('cancelled', () => {
      this.mapLabelDialog.visible = false
      this.mapCanvas.emit('gotLabel', this.mapCanvas.selectedTile.label)
    })

    this.mapCommentDialog = new MapCommentDialog()
    this.mapCommentDialog.visible = false
    this.addChild(this.mapCommentDialog)

    this.mapCanvas.on('requestComment', () => {
      this.mapCommentDialog.visible = true
      this.mapCommentDialog.setComment(this.mapCanvas.selectedTile.comment)
      this.root.select(this.mapCommentDialog)
    })

    this.mapCommentDialog.on('entered', value => {
      this.mapCommentDialog.visible = false
      this.mapCanvas.emit('gotComment', value)
    })

    this.mapCommentDialog.on('cancelled', () => {
      this.mapCommentDialog.visible = false
      this.mapCanvas.emit('gotComment', this.mapCanvas.selectedTile.comment)
    })

    this.openFileDialog = new OpenFileDialog()
    this.openFileDialog.visible = false
    this.addChild(this.openFileDialog)

    this.saveFileSelected(saveFilePath)
  }

  fixLayout() {
    this.w = this.parent.contentW
    this.h = this.parent.contentH

    this.pane.w = this.contentW
    this.pane.h = this.contentH

    this.mapCanvas.w = this.pane.contentW
    this.mapCanvas.h = this.pane.contentH

    this.editingFileLabel.x = 0
    this.editingFileLabel.y = this.pane.contentH - 1
  }

  focused() {
    this.root.select(this.mapCanvas)
  }

  keyPressed(keyBuf) {
    if (keyBuf[0] === 3) { // ^C
      this.emit('quitRequested')
    } else if (keyBuf[0] === 19) { // ^S
      writeFile(this.saveFilePath, JSON.stringify(this.generateSaveObj(), null, 2)).then(
        () => {
          this.editingFileLabel.text = 'Saved.'
          setTimeout(() => this.restoreEditingFileMessage(), 1000)
        },
        err => {
          this.error('Failed to save: ' + err.message)
        }
      )
    } else if (keyBuf[0] === 15) { // ^O
      this.openFileDialog.go().then(filePath => {
        if (filePath) {
          this.saveFileSelected(filePath)
        } else {
          this.root.select(this)
        }
      })
    } else {
      super.keyPressed(keyBuf)
    }
  }

  saveFileSelected(saveFilePath) {
    readFile(saveFilePath).then(
      () => {
        this.openFile(saveFilePath)
      },
      () => {
        this.editingFileLabel.text = 'New file: ' + path.relative(__dirname, saveFilePath)
        this.saveFilePath = saveFilePath
        this.root.select(this)
      })
  }

  async openFile(filePath) {
    load: {
      let text

      try {
        text = await readFile(filePath)
      } catch(err) {
        if (err.code === 'ENOENT') {
          await this.error(`File not found: ${filePath}`)
          break load
        } else {
          throw err
        }
      }

      let save

      try {
        save = JSON.parse(text)
      } catch(err) {
        await this.error(`Invalid JSON data: ${filePath}`)
        break load
      }

      this.saveFilePath = filePath
      this.loadSaveObj(save)
      this.restoreEditingFileMessage()
    }

    this.root.select(this)
  }

  restoreEditingFileMessage() {
    this.editingFileLabel.text = 'Editing file: ' + path.relative(__dirname, this.saveFilePath)
  }

  error(message) {
    const dialog = new CancelDialog(message)
    this.addChild(dialog)
    this.root.select(dialog)

    return new Promise(resolve => {
      dialog.once('cancelled', () => {
        this.removeChild(dialog)
        this.root.select(this)
        resolve()
      })
    })
  }

  generateSaveObj() {
    const { tiles, scrollX, scrollY, selectedX, selectedY } = this.mapCanvas
    return {
      tiles, scrollX, scrollY, selectedX, selectedY
    }
  }

  loadSaveObj(save) {
    const { tiles, scrollX, scrollY, selectedX, selectedY } = save
    Object.assign(this.mapCanvas, {
      tiles, scrollX, scrollY, selectedX, selectedY
    })
  }
}

const clInterface = new CommandLineInterface()

clInterface.getScreenSize().then(size => {
  const flushable = new Flushable(process.stdout, true)

  flushable.screenLines = size.height
  flushable.screenCols = size.cols
  flushable.shouldShowCompressionStatistics = process.argv.includes('--show-ansi-stats')
  flushable.write(ansi.clearScreen())
  flushable.flush()

  const root = new Root(clInterface)
  root.w = size.width
  root.h = size.height

  const appElement = new AppElement(
    (process.argv[2] && process.argv[2][0] !== '-')
    ? process.argv[2]
    : 'save.json')

  root.addChild(appElement)
  root.select(appElement)
  root.fixAllLayout()

  appElement.on('quitRequested', () => {
    process.exit(0)
  })

  setInterval(() => {
    root.renderTo(flushable)
    flushable.flush()
  }, 100)
}).catch(error => {
  console.error(error)
  process.exit(1)
})
