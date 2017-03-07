﻿namespace SourceUtils {
    export class SmdModel
    {
        bodyPart: SmdBodyPart;
        index: number;

        private info: Api.ISmdModel;
        private meshData: Api.IMdlMeshDataResponse;

        constructor(bodyPart: SmdBodyPart, index: number, info: Api.ISmdModel) {
            this.bodyPart = bodyPart;
            this.index = index;
            this.info = info;
        }

        hasLoaded(): boolean {
            return this.meshData != null;
        }

        createMeshHandles(vertexColors?: HardwareVerts): WorldMeshHandle[] {
            const meshData = new MeshData(this.meshData);

            if (vertexColors != null) {
                for (let i = 0; i < meshData.elements.length; ++i) {
                    const meshColors = Utils.decompress(vertexColors.getSamples(i));
                    const offset = meshData.elements[i].vertexOffset;
                    const count = meshData.elements[i].vertexCount;

                    if (meshColors != null) {
                        // TODO: make generic
                        const itemSize = 8;
                        const itemOffset = offset * itemSize;
                        const verts = meshData.vertices;

                        for (let j = 0, jEnd = count; j < jEnd; ++j) {
                            verts[j * itemSize + itemOffset + 5] = meshColors[j * 3 + 0];
                            verts[j * itemSize + itemOffset + 6] = meshColors[j * 3 + 1];
                            verts[j * itemSize + itemOffset + 7] = meshColors[j * 3 + 2];
                        }
                    }
                }
            }

            const handles = this.bodyPart.mdl.getMap().meshManager.addMeshData(meshData);

            for (let i = 0; i < handles.length; ++i) {
                handles[i].material = this.bodyPart.mdl.getMaterial(handles[i].materialIndex);
            }

            return handles;
        }

        loadNext(callback: (requeue: boolean) => void): void {
            if (this.meshData == null) {
                this.loadMeshData(callback);
            } else {
                callback(false);
            }
        }

        private loadMeshData(callback: (requeue: boolean) => void): void {
            $.getJSON(this.info.meshDataUrl, (data: Api.IMdlMeshDataResponse) => {
                this.meshData = data;
                this.meshData.vertices = Utils.decompress(this.meshData.vertices);
                this.meshData.indices = Utils.decompress(this.meshData.indices);
                callback(true);
            }).fail(() => callback(false));
        }
    }

    export class SmdBodyPart {
        name: string;

        mdl: StudioModel;
        index: number;
        models: SmdModel[];

        constructor(mdl: StudioModel, index: number, info: Api.ISmdBodyPart) {
            this.name = info.name;
            this.mdl = mdl;
            this.index = index;
            this.models = [];

            for (let i = 0; i < info.models.length; ++i) {
                this.models.push(new SmdModel(this, i, info.models[i]));
            }
        }
    }

    export class StudioModel implements ILoadable<StudioModel> {
        private map: Map;
        private mdlUrl: string;
        private info: Api.IMdlResponse;
        private materials: Material[];
        private bodyParts: SmdBodyPart[];
        private toLoad: SmdModel[];
        private loaded: SmdModel[] = [];
        private modelLoadCallbacks: ((model: SmdModel) => void)[] = [];

        constructor(map: Map, url: string) {
            this.map = map;
            this.mdlUrl = url;
        }

        getMap(): Map { return this.map; }

        hasLoadedModel(bodyPart: number, model: number): boolean {
            if (this.bodyParts == null) return false;
            return this.bodyParts[bodyPart].models[model].hasLoaded();
        }

        getModel(bodyPart: number, model: number): SmdModel {
            return this.bodyParts == null ? null : this.bodyParts[bodyPart].models[model];
        }

        getMaterial(index: number): Material {
            return this.materials[index];
        }

        shouldLoadBefore(other: StudioModel): boolean {
            return true;
        }

        loadNext(callback: (requeue: boolean) => void): void {
            if (this.info == null) {
                this.loadInfo(callback);
                return;
            }

            if (this.toLoad.length === 0) {
                callback(false);
                return;
            }

            const next = this.toLoad[0];
            next.loadNext(requeue2 => {
                if (!requeue2) {
                    this.toLoad.splice(0, 1);

                    if (next.hasLoaded()) {
                        this.loaded.push(next);
                        this.dispatchModelLoadEvent(next);
                    }
                }
                callback(this.toLoad.length > 0);
            });
        }

        private dispatchModelLoadEvent(model: SmdModel): void {
            for (let i = 0; i < this.modelLoadCallbacks.length; ++i) {
                this.modelLoadCallbacks[i](model);
            }
        }

        addModelLoadCallback(callback: (model: SmdModel) => void): void {
            for (let i = 0; i < this.loaded.length; ++i) {
                callback(this.loaded[i]);
            }

            this.modelLoadCallbacks.push(callback);
        }

        private loadInfo(callback: (success: boolean) => void): void {
            $.getJSON(this.mdlUrl, (data: Api.IMdlResponse) => {
                this.info = data;
                this.materials = [];
                this.bodyParts = [];
                this.toLoad = [];

                for (let i = 0; i < data.materials.length; ++i) {
                    this.materials.push(data.materials[i] == null ? null : new Material(this.map, data.materials[i]));
                }

                for (let i = 0; i < data.bodyParts.length; ++i) {
                    const bodyPart = new SmdBodyPart(this, i, data.bodyParts[i]);
                    this.bodyParts.push(bodyPart);

                    for (let j = 0; j < bodyPart.models.length; ++j) {
                        this.toLoad.push(bodyPart.models[j]);
                    }
                }

                callback(true);
            }).fail(() => callback(false));
        }
    }
}